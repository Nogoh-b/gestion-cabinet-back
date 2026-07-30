import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDirectory = join(root, 'src', 'migrations');
const failures = [];

function fail(message) {
  failures.push(message);
}

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

async function expectedMigrations() {
  const files = (await readdir(migrationsDirectory))
    .filter((name) => /^\d{13}-.+\.ts$/.test(name))
    .sort();
  return Promise.all(
    files.map(async (file) => {
      const timestamp = Number(file.slice(0, 13));
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
      if (!name || !name.endsWith(String(timestamp))) {
        throw new Error(`Nom TypeORM invalide pour ${file}`);
      }
      return { timestamp, name };
    }),
  );
}

function assertColumns(tableColumns, table, expected) {
  const columns = tableColumns.get(table) ?? new Set();
  for (const column of expected) {
    if (!columns.has(column)) {
      fail(`Colonne manquante : ${table}.${column}`);
    }
  }
}

function enumValues(columnType) {
  return Array.from(String(columnType).matchAll(/'([^']*)'/g))
    .map((match) => match[1])
    .sort();
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

const connection = await mysql.createConnection({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parsePort(process.env.DB_PORT),
  user: required('DB_USER'),
  password: process.env.DB_PASSWORD || '',
  database,
});

try {
  const expected = await expectedMigrations();
  const [migrationRows] = await connection.query(
    'SELECT `timestamp`, `name` FROM migrations ORDER BY `timestamp`',
  );
  const executed = new Map(
    migrationRows.map((row) => [Number(row.timestamp), String(row.name)]),
  );
  if (migrationRows.length !== expected.length) {
    fail(
      `Nombre de migrations exécutées incorrect : ${migrationRows.length}/${expected.length}`,
    );
  }
  for (const migration of expected) {
    if (executed.get(migration.timestamp) !== migration.name) {
      fail(
        `Migration non rapprochée : ${migration.timestamp} ${migration.name}`,
      );
    }
  }

  const [tableRows] = await connection.query(
    `SELECT TABLE_NAME AS table_name
       FROM information_schema.tables
      WHERE table_schema = ?`,
    [database],
  );
  const tables = new Set(tableRows.map((row) => String(row.table_name)));
  for (const table of [
    'plans',
    'cabinets',
    'country',
    'region',
    'division',
    'districts',
    'location_city',
    'auth_tokens',
    'otp_codes',
    'otp_online_link',
    'type_customer_document_type',
    'lignes_ecriture_comptable',
    'audit_events',
    'outbox_events',
    'outbox_delivery_attempts',
    'dossier_members',
    'document_versions',
    'procedure_templates',
    'procedure_instances',
    'supplier_evidence_migration_issues',
    'dossier_lifecycle_migration_audit',
    'procedure_repair_issues',
    'document_migration_issues',
    'referral_commission_migration_issues',
    'chat_attachment_migration_report',
  ]) {
    if (!tables.has(table)) fail(`Table de certification manquante : ${table}`);
  }

  const [columnRows] = await connection.query(
    `SELECT TABLE_NAME AS table_name,
            COLUMN_NAME AS column_name,
            COLUMN_TYPE AS column_type
       FROM information_schema.columns
      WHERE table_schema = ?`,
    [database],
  );
  const tableColumns = new Map();
  for (const row of columnRows) {
    const table = String(row.table_name);
    const columns = tableColumns.get(table) ?? new Set();
    columns.add(String(row.column_name));
    tableColumns.set(table, columns);
  }

  assertColumns(tableColumns, 'audit_events', [
    'tenant_id',
    'actor_id',
    'action',
    'resource_type',
    'resource_id',
    'request_id',
    'previous_hash',
    'current_hash',
    'occurred_at',
  ]);
  assertColumns(tableColumns, 'outbox_events', [
    'tenant_id',
    'event_type',
    'aggregate_type',
    'aggregate_id',
    'idempotency_key',
    'status',
    'attempts',
    'next_attempt_at',
    'last_error',
  ]);
  assertColumns(tableColumns, 'document_versions', [
    'tenant_id',
    'document_id',
    'version_number',
    'storage_key',
    'detected_mime',
    'size_bytes',
    'sha256',
    'status',
    'antivirus_status',
    'legal_hold',
  ]);
  assertColumns(tableColumns, 'procedure_templates', [
    'tenant_id',
    'family_id',
    'version',
    'lifecycle_status',
    'content_hash',
  ]);
  assertColumns(tableColumns, 'procedure_instances', [
    'tenant_id',
    'template_family_id',
    'template_version_id',
    'template_snapshot',
    'template_snapshot_hash',
    'status',
  ]);
  for (const table of ['supplier_invoice', 'expense_line']) {
    assertColumns(tableColumns, table, [
      'tenant_id',
      'attachment_url',
      'attachment_original_name',
      'attachment_mime_type',
      'attachment_size',
      'attachment_sha256',
    ]);
  }
  assertColumns(
    tableColumns,
    'dossier_lifecycle_migration_audit',
    ['review_status', 'reviewed_by_id', 'review_note', 'reviewed_at'],
  );
  for (const table of [
    'supplier_evidence_migration_issues',
    'referral_commission_migration_issues',
    'chat_attachment_migration_report',
  ]) {
    assertColumns(tableColumns, table, [
      'resolution_status',
      'resolved_by_id',
      'resolution_note',
      'resolved_at',
    ]);
  }

  const dossierColumns = tableColumns.get('dossiers') ?? new Set();
  for (const column of dossierColumns) {
    if (
      /(procedural|procedure_phase|phase_procedurale|workflow_decision)/i.test(
        column,
      )
    ) {
      fail(`Projection procédurale interdite dans dossiers.${column}`);
    }
  }
  const dossierStatus = columnRows.find(
    (row) =>
      String(row.table_name) === 'dossiers' &&
      String(row.column_name) === 'status',
  );
  const actualStatuses = enumValues(dossierStatus?.column_type);
  const expectedStatuses = ['ACTIVE', 'ARCHIVED', 'CLOSED', 'DRAFT'];
  if (
    actualStatuses.length !== expectedStatuses.length ||
    actualStatuses.some(
      (status, index) => status !== expectedStatuses[index],
    )
  ) {
    fail(
      `Enum dossiers.status invalide : ${actualStatuses.join(', ') || 'absent'}`,
    );
  }

  const [triggerRows] = await connection.query(
    `SELECT TRIGGER_NAME AS trigger_name
       FROM information_schema.triggers
      WHERE trigger_schema = ?`,
    [database],
  );
  const triggers = new Set(
    triggerRows.map((row) => String(row.trigger_name)),
  );
  for (const trigger of [
    'trg_audit_events_no_update',
    'trg_audit_events_no_delete',
    'trg_document_version_immutable',
    'trg_document_version_protected_delete',
  ]) {
    if (!triggers.has(trigger)) fail(`Trigger probatoire manquant : ${trigger}`);
  }

  if (failures.length) {
    throw new Error(
      `Certification du schéma en échec:\n- ${failures.join('\n- ')}`,
    );
  }
  console.log(
    `Schéma vivant certifié : ${expected.length} migrations, ${tables.size} tables, cycle dossier administratif uniquement.`,
  );
} finally {
  await connection.end();
}
