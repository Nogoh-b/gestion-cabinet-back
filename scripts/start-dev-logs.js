const { spawn } = require('node:child_process');

// VS Code/ConPTY peut parfois afficher les octets ANSI comme du texte
// (par exemple "←[2J") et concaténer les logs sur une seule ligne. Ce relais
// conserve le watch Nest, mais nettoie uniquement ces séquences de contrôle.
const ANSI_PATTERN = /\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g;

const nestCli = require.resolve('@nestjs/cli/bin/nest.js');
const child = spawn(
  process.execPath,
  [nestCli, 'start', '--watch', '--preserveWatchOutput'],
  {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NO_COLOR: '1',
      FORCE_COLOR: '0',
    },
    stdio: ['inherit', 'pipe', 'pipe'],
    windowsHide: true,
  },
);

function forward(source, destination) {
  source.setEncoding('utf8');
  source.on('data', (chunk) => {
    destination.write(chunk.replace(ANSI_PATTERN, ''));
  });
}

forward(child.stdout, process.stdout);
forward(child.stderr, process.stderr);

let stopping = false;
function stop(signal) {
  if (stopping) return;
  stopping = true;
  child.kill(signal);
}

process.on('SIGINT', () => stop('SIGINT'));
process.on('SIGTERM', () => stop('SIGTERM'));

child.on('error', (error) => {
  console.error('[dev] Impossible de lancer Nest :', error);
  process.exitCode = 1;
});

child.on('exit', (code, signal) => {
  if (signal && !stopping) {
    console.error(`[dev] Nest arrêté par le signal ${signal}.`);
  }
  process.exitCode = code ?? (stopping ? 0 : 1);
});
