import 'dotenv/config';

import { createHash } from 'crypto';
import { execFile, spawn } from 'child_process';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { isAbsolute, join, resolve } from 'path';
import { promisify } from 'util';
import mysql, { Connection, RowDataPacket } from 'mysql2/promise';

import { assertMigrationRehearsalTarget } from '../src/core/config/migration-rehearsal-safety';

const execFileAsync = promisify(execFile);
const root = resolve(__dirname, '..');
const execute = process.argv.includes('--execute');
const REQUIRED_HISTORICAL_MIGRATIONS = [
  1779107127070, 1779200000000, 1779300000000, 1779400000000, 1779500000000,
  1779600000000, 1781600000000, 1782000002000, 1782000004000, 1782000005000,
  1782100000000, 1782100001000, 1782100002000, 1782200000000,
];

interface DatabaseSnapshot {
  serverVersion: string;
  tableCount: number;
  migrationCount: number;
  historicalReconciliationReady: boolean;
  missingHistoricalMigrations: number[];
}

interface VersionRow extends RowDataPacket {
  serverVersion: string;
}

interface CountRow extends RowDataPacket {
  total: number;
}

interface MigrationTimestampRow extends RowDataPacket {
  timestamp: string;
}

interface RehearsalStep {
  name: string;
  status: 'SUCCESS' | 'FAILED' | 'SKIPPED';
  startedAt?: string;
  finishedAt?: string;
}

interface RehearsalReport {
  mode: 'PREFLIGHT' | 'EXECUTE';
  status: 'READY' | 'SUCCESS' | 'FAILED';
  startedAt: string;
  finishedAt?: string;
  source: {
    gitSha: string;
    packageLockSha256: string;
  };
  target: {
    database: string;
    hostClass: 'local' | 'private' | 'remote';
    port: number;
  };
  before?: DatabaseSnapshot;
  after?: DatabaseSnapshot;
  steps: RehearsalStep[];
  failure?: string;
}

function timestampForFile(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}

async function sourceIdentity(): Promise<RehearsalReport['source']> {
  const [{ stdout }, packageLock] = await Promise.all([
    execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root }),
    readFile(join(root, 'package-lock.json')),
  ]);
  return {
    gitSha: stdout.trim(),
    packageLockSha256: createHash('sha256').update(packageLock).digest('hex'),
  };
}

async function databaseSnapshot(
  connection: Connection,
  database: string,
): Promise<DatabaseSnapshot> {
  const [[versionRow]] = await connection.query<VersionRow[]>(
    'SELECT VERSION() AS serverVersion',
  );
  const [[tableRow]] = await connection.query<CountRow[]>(
    `SELECT COUNT(*) AS total
       FROM information_schema.tables
      WHERE table_schema = ?`,
    [database],
  );
  const [[migrationsTableRow]] = await connection.query<CountRow[]>(
    `SELECT COUNT(*) AS total
       FROM information_schema.tables
      WHERE table_schema = ?
        AND table_name = 'migrations'`,
    [database],
  );

  let migrationCount = 0;
  let executedTimestamps = new Set<number>();
  if (Number(migrationsTableRow.total) > 0) {
    const [rows] = await connection.query<MigrationTimestampRow[]>(
      'SELECT `timestamp` FROM migrations',
    );
    executedTimestamps = new Set(
      rows.map(({ timestamp }) => Number(timestamp)),
    );
    migrationCount = rows.length;
  }
  const missingHistoricalMigrations = REQUIRED_HISTORICAL_MIGRATIONS.filter(
    (timestamp) => !executedTimestamps.has(timestamp),
  );
  return {
    serverVersion: String(versionRow.serverVersion),
    tableCount: Number(tableRow.total),
    migrationCount,
    historicalReconciliationReady: missingHistoricalMigrations.length === 0,
    missingHistoricalMigrations,
  };
}

async function runNpmStep(step: RehearsalStep): Promise<void> {
  step.startedAt = new Date().toISOString();
  const executable = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const exitCode = await new Promise<number>((resolveCode, reject) => {
    const handle = spawn(executable, ['run', step.name], {
      cwd: root,
      env: process.env,
      shell: false,
      stdio: 'inherit',
    });
    handle.on('error', reject);
    handle.on('close', (code) => resolveCode(code ?? 1));
  });
  step.finishedAt = new Date().toISOString();
  if (exitCode !== 0) {
    step.status = 'FAILED';
    throw new Error(`La porte ${step.name} a échoué`);
  }
  step.status = 'SUCCESS';
}

function markdown(report: RehearsalReport): string {
  const lines = [
    '# Rapport de répétition de migration V3',
    '',
    `- Mode : ${report.mode}`,
    `- Statut : ${report.status}`,
    `- Début UTC : ${report.startedAt}`,
    `- Fin UTC : ${report.finishedAt ?? 'en cours'}`,
    `- Commit : \`${report.source.gitSha}\``,
    `- Empreinte package-lock : \`${report.source.packageLockSha256}\``,
    `- Base : \`${report.target.database}\``,
    `- Classe d’hôte : ${report.target.hostClass}`,
    `- Port : ${report.target.port}`,
    '',
    '## Préflight',
    '',
    `- Version serveur : ${report.before?.serverVersion ?? 'indisponible'}`,
    `- Tables avant migration : ${report.before?.tableCount ?? 0}`,
    `- Migrations avant migration : ${report.before?.migrationCount ?? 0}`,
    `- Rapprochement historique : ${
      report.before?.historicalReconciliationReady ? 'OK' : 'BLOQUÉ'
    }`,
  ];
  if (report.before?.missingHistoricalMigrations.length) {
    lines.push(
      `- Migrations historiques manquantes : ${report.before.missingHistoricalMigrations.join(', ')}`,
    );
  }
  lines.push('', '## Portes exécutées', '');
  for (const step of report.steps) {
    lines.push(`- ${step.name} : ${step.status}`);
  }
  if (report.after) {
    lines.push(
      '',
      '## Résultat',
      '',
      `- Tables après migration : ${report.after.tableCount}`,
      `- Migrations après migration : ${report.after.migrationCount}`,
    );
  }
  if (report.failure) {
    lines.push('', '## Blocage', '', report.failure);
  }
  lines.push('');
  return lines.join('\n');
}

async function persistReport(
  report: RehearsalReport,
  reportDirectory: string,
  identifier: string,
): Promise<void> {
  await mkdir(reportDirectory, { recursive: true, mode: 0o700 });
  const jsonPath = join(reportDirectory, `${identifier}.json`);
  const markdownPath = join(reportDirectory, `${identifier}.md`);
  await Promise.all([
    writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, {
      mode: 0o600,
    }),
    writeFile(markdownPath, markdown(report), { mode: 0o600 }),
  ]);
  process.stdout.write(`Rapports créés : ${jsonPath} et ${markdownPath}\n`);
}

async function main(): Promise<void> {
  const startedAt = new Date();
  const target = assertMigrationRehearsalTarget(process.env);
  const configuredReportDirectory =
    process.env.MIGRATION_REHEARSAL_REPORT_DIR?.trim();
  const reportDirectory = configuredReportDirectory
    ? isAbsolute(configuredReportDirectory)
      ? configuredReportDirectory
      : resolve(root, configuredReportDirectory)
    : join(root, 'artifacts-private', 'migration-rehearsal');
  const identifier = `migration-rehearsal-${timestampForFile(startedAt)}`;
  const report: RehearsalReport = {
    mode: execute ? 'EXECUTE' : 'PREFLIGHT',
    status: 'FAILED',
    startedAt: startedAt.toISOString(),
    source: await sourceIdentity(),
    target: {
      database: target.database,
      hostClass: target.hostClass,
      port: target.port,
    },
    steps: ['migration:run', 'migration:verify', 'migration:verify-data'].map(
      (name) => ({ name, status: 'SKIPPED' }),
    ),
  };

  let connection: Connection | undefined;
  try {
    connection = await mysql.createConnection({
      host: target.host,
      port: target.port,
      user: target.user,
      password: process.env.DB_PASSWORD ?? '',
      database: target.database,
    });
    report.before = await databaseSnapshot(connection, target.database);
    if (report.before.tableCount === 0) {
      throw new Error(
        'La cible est vide : utilisez migration:bootstrap pour la preuve sur base vide',
      );
    }
    if (!report.before.historicalReconciliationReady) {
      throw new Error(
        'L’état des migrations historiques n’est pas rapproché ; analyse manuelle obligatoire avant toute écriture',
      );
    }
    if (!execute) {
      report.status = 'READY';
      return;
    }

    for (const step of report.steps) await runNpmStep(step);
    report.after = await databaseSnapshot(connection, target.database);
    report.status = 'SUCCESS';
  } catch (error) {
    report.failure =
      error instanceof Error ? error.message : 'Échec non identifié';
    throw error;
  } finally {
    if (connection) await connection.end();
    report.finishedAt = new Date().toISOString();
    await persistReport(report, reportDirectory, identifier);
  }
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Échec non identifié'}\n`,
  );
  process.exitCode = 1;
});
