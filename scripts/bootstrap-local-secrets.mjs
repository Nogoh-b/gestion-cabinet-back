import { randomBytes, randomUUID } from 'node:crypto';
import { chmod, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SECRET_NAME = 'JWT_REFRESH_SECRET';
const SECRET_BYTES = 64;

function argumentValue(name) {
  const prefix = `${name}=`;
  const argument = process.argv.slice(2).find((value) =>
    value.startsWith(prefix),
  );
  return argument?.slice(prefix.length);
}

function unquote(value) {
  const trimmed = value.trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

export function hasConfiguredSecret(source) {
  return source.split(/\r?\n/).some((line) => {
    const match = line.match(
      /^\s*(?:export\s+)?JWT_REFRESH_SECRET\s*=(.*)$/,
    );
    return Boolean(match && unquote(match[1]).length > 0);
  });
}

export function withGeneratedRefreshSecret(source, secret) {
  const newline = source.includes('\r\n') ? '\r\n' : '\n';
  const lines = source.split(/\r?\n/);
  let inserted = false;
  const updated = [];

  for (const line of lines) {
    if (/^\s*(?:export\s+)?JWT_REFRESH_SECRET\s*=/.test(line)) {
      if (!inserted) {
        updated.push(`${SECRET_NAME}=${secret}`);
        inserted = true;
      }
      continue;
    }
    updated.push(line);
  }

  if (!inserted) {
    if (updated.length && updated.at(-1) !== '') updated.push('');
    updated.push(`${SECRET_NAME}=${secret}`);
  }
  if (updated.at(-1) !== '') updated.push('');
  return updated.join(newline);
}

async function main() {
  const envPath = resolve(
    process.cwd(),
    argumentValue('--env-file') || '.env',
  );
  let source = '';
  try {
    source = await readFile(envPath, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  if (hasConfiguredSecret(source)) {
    console.log(`${SECRET_NAME} est déjà configuré ; aucune modification.`);
    return;
  }

  const secret = randomBytes(SECRET_BYTES).toString('base64url');
  const updated = withGeneratedRefreshSecret(source, secret);
  const temporaryPath = `${envPath}.${process.pid}.${randomUUID()}.tmp`;

  await writeFile(temporaryPath, updated, {
    encoding: 'utf8',
    flag: 'wx',
    mode: 0o600,
  });
  await rename(temporaryPath, envPath);
  try {
    await chmod(envPath, 0o600);
  } catch {
    // Windows peut ignorer les permissions POSIX ; le fichier reste exclu de Git.
  }
  console.log(
    `${SECRET_NAME} a été généré dans ${envPath} sans afficher sa valeur.`,
  );
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main();
}
