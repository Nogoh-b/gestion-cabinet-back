import 'dotenv/config';
import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const baselinePath = join(
  root,
  'database',
  'baseline',
  'legacy-schema-2026-06-26.sql',
);
const migrationsDirectory = join(root, 'src', 'migrations');
// The baseline is an exact, hashed legacy snapshot. Only migrations whose
// effects are already present (or whose legacy tables are intentionally
// absent) may be reconciled here. A chronological cutoff is unsafe because
// the subscription migrations below predate features already present in the
// snapshot while their tables are not part of it.
const baselineReconciledMigrationTimestamps = new Set([
  1_779_107_127_070,
  1_779_200_000_000,
  1_779_300_000_000,
  1_779_400_000_000,
  1_779_500_000_000,
  1_779_600_000_000,
  1_781_600_000_000,
  1_782_000_002_000,
  1_782_000_004_000,
  1_782_000_005_000,
  1_782_100_000_000,
  1_782_100_001_000,
  1_782_100_002_000,
  1_782_200_000_000,
]);
const expectedBaselineHash =
  '92f7786974c9a531cdbd7b21c756413c084661566fdcec9485c0caf9632d9890';

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} est obligatoire`);
  return value;
}

function parsePort(value) {
  const port = Number(value ?? 3306);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error('DB_PORT est invalide');
  }
  return port;
}

const database = required('DB_NAME');
if (
  !/^[A-Za-z0-9_]+$/.test(database) ||
  ['mysql', 'information_schema', 'performance_schema', 'sys'].includes(
    database.toLowerCase(),
  )
) {
  throw new Error('DB_NAME ne peut pas désigner une base système');
}

const baseline = await readFile(baselinePath, 'utf8');
const actualHash = createHash('sha256').update(baseline).digest('hex');
if (actualHash !== expectedBaselineHash) {
  throw new Error(
    `Empreinte du schéma de référence inattendue (${actualHash})`,
  );
}
if (/^\s*INSERT\s+INTO\b/im.test(baseline)) {
  throw new Error('Le schéma de référence contient des données');
}

const connection = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parsePort(process.env.DB_PORT),
  user: required('DB_USER'),
  password: process.env.DB_PASSWORD || '',
  database,
  multipleStatements: true,
});

try {
  const [existingTables] = await connection.query(
    `SELECT COUNT(*) AS total
       FROM information_schema.tables
      WHERE table_schema = ?`,
    [database],
  );
  if (Number(existingTables[0]?.total ?? 0) !== 0) {
    throw new Error(
      'Bootstrap refusé : la base cible doit être totalement vide',
    );
  }

  await connection.query(baseline);
  await connection.query(`
    CREATE TABLE migrations (
      id INT NOT NULL AUTO_INCREMENT,
      timestamp BIGINT NOT NULL,
      name VARCHAR(255) NOT NULL,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB
  `);

  const migrationFiles = (await readdir(migrationsDirectory))
    .filter((name) => /^\d+-.+\.ts$/.test(name))
    .sort();
  const representedMigrations = (
    await Promise.all(
      migrationFiles.map(async (file) => {
      const match = file.match(/^(\d+)-(.+)\.ts$/);
      const source = await readFile(
        join(migrationsDirectory, file),
        'utf8',
      );
      const explicitName = source.match(
        /\bname\s*=\s*['"]([^'"]+)['"]/,
      )?.[1];
      const className = source.match(
        /\bexport\s+class\s+([A-Za-z_$][\w$]*)/,
      )?.[1];
      const name = explicitName ?? className;
      if (!name || !name.endsWith(match[1])) {
        throw new Error(
          `Nom TypeORM invalide pour ${file}: ${name ?? 'absent'}`,
        );
      }
      return {
        timestamp: Number(match[1]),
        name,
      };
      }),
    )
  ).filter(({ timestamp }) =>
    baselineReconciledMigrationTimestamps.has(timestamp),
  );

  const reconciledTimestamps = new Set(
    representedMigrations.map(({ timestamp }) => timestamp),
  );
  const missingReconciliations = [
    ...baselineReconciledMigrationTimestamps,
  ].filter((timestamp) => !reconciledTimestamps.has(timestamp));
  if (missingReconciliations.length > 0) {
    throw new Error(
      `Migrations historiques introuvables : ${missingReconciliations.join(', ')}`,
    );
  }

  for (const migration of representedMigrations) {
    await connection.execute(
      'INSERT INTO migrations (`timestamp`, `name`) VALUES (?, ?)',
      [migration.timestamp, migration.name],
    );
  }

  console.log(
    `Base vide initialisée : 71 tables de référence, ${representedMigrations.length} migrations historiques rapprochées.`,
  );
} finally {
  await connection.end();
}
