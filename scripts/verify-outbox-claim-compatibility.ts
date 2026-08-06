import 'dotenv/config';
import { randomUUID } from 'crypto';
import {
  ResultSetHeader,
  RowDataPacket,
} from 'mysql2/promise';
import * as mysql from 'mysql2/promise';
import { outboxClaimSql } from '../src/core/outbox/outbox-worker.service';

type VersionRow = RowDataPacket & {
  version: string;
};

type ClaimedRow = RowDataPacket & {
  id: string;
  status: string;
  attempts: number;
  locked_by: string | null;
};

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} est obligatoire`);
  return value;
}

function parsePort(value: string | undefined): number {
  const port = Number(value ?? 3306);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    throw new Error('DB_PORT est invalide');
  }
  return port;
}

async function main(): Promise<void> {
  const connection = await mysql.createConnection({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parsePort(process.env.DB_PORT),
    user: required('DB_USER'),
    password: process.env.DB_PASSWORD || '',
    database: required('DB_NAME'),
  });
  let transactionStarted = false;

  try {
    const [[versionRow]] = await connection.query<VersionRow[]>(
      'SELECT VERSION() AS version',
    );
    await connection.query(
      'DROP TEMPORARY TABLE IF EXISTS outbox_events',
    );
    await connection.query(`
      CREATE TEMPORARY TABLE outbox_events (
        id CHAR(36) NOT NULL,
        status VARCHAR(32) NOT NULL,
        attempts INT NOT NULL DEFAULT 0,
        next_attempt_at DATETIME NULL,
        locked_at DATETIME NULL,
        locked_by VARCHAR(120) NULL,
        last_error TEXT NULL,
        deleted_at DATETIME NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY idx_outbox_claim (status, next_attempt_at, created_at)
      ) ENGINE=InnoDB
    `);

    const pendingId = randomUUID();
    const futureId = randomUUID();
    const staleId = randomUUID();
    const freshId = randomUUID();
    await connection.query(
      `INSERT INTO outbox_events (
         id,
         status,
         attempts,
         next_attempt_at,
         locked_at,
         locked_by,
         created_at
       ) VALUES
         (?, 'PENDING', 0, NULL, NULL, NULL, DATE_SUB(UTC_TIMESTAMP(), INTERVAL 4 MINUTE)),
         (?, 'FAILED', 1, DATE_ADD(UTC_TIMESTAMP(), INTERVAL 1 HOUR), NULL, NULL, DATE_SUB(UTC_TIMESTAMP(), INTERVAL 3 MINUTE)),
         (?, 'PROCESSING', 2, NULL, DATE_SUB(UTC_TIMESTAMP(), INTERVAL 11 MINUTE), 'stale-worker', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 2 MINUTE)),
         (?, 'PROCESSING', 3, NULL, UTC_TIMESTAMP(), 'fresh-worker', DATE_SUB(UTC_TIMESTAMP(), INTERVAL 1 MINUTE))`,
      [pendingId, futureId, staleId, freshId],
    );

    await connection.beginTransaction();
    transactionStarted = true;
    const claimToken = randomUUID();
    const [result] = await connection.query<ResultSetHeader>(
      outboxClaimSql(),
      [claimToken],
    );
    const [claimed] = await connection.query<ClaimedRow[]>(
      `SELECT id, status, attempts, locked_by
         FROM outbox_events
        WHERE locked_by = ?
        ORDER BY created_at, id`,
      [claimToken],
    );
    const [untouched] = await connection.query<ClaimedRow[]>(
      `SELECT id, status, attempts, locked_by
         FROM outbox_events
        WHERE id IN (?, ?)
        ORDER BY id`,
      [futureId, freshId],
    );

    if (result.affectedRows !== 2 || claimed.length !== 2) {
      throw new Error(
        `Réclamation atomique invalide : ${result.affectedRows} ligne(s) modifiée(s), ${claimed.length} relue(s)`,
      );
    }
    const claimedIds = new Set(claimed.map((row) => row.id));
    if (!claimedIds.has(pendingId) || !claimedIds.has(staleId)) {
      throw new Error(
        'Le lot doit contenir le travail en attente et le verrou expiré',
      );
    }
    if (
      claimed.some(
        (row) =>
          row.status !== 'PROCESSING' ||
          row.locked_by !== claimToken ||
          row.attempts < 1,
      )
    ) {
      throw new Error('Le lot réclamé porte un état ou un jeton invalide');
    }
    if (
      untouched.length !== 2 ||
      untouched.some((row) => row.locked_by === claimToken)
    ) {
      throw new Error(
        'Un travail futur ou un verrou frais a été réclamé à tort',
      );
    }

    await connection.rollback();
    transactionStarted = false;
    console.log(
      `Réclamation outbox compatible avec ${versionRow.version} : 2 travaux réclamés, 2 préservés.`,
    );
  } finally {
    if (transactionStarted) await connection.rollback();
    await connection.query(
      'DROP TEMPORARY TABLE IF EXISTS outbox_events',
    );
    await connection.end();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
