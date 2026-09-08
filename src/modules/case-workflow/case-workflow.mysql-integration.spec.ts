import { describe, expect, it, beforeAll, afterAll } from '@jest/globals';
import { DataSource, QueryRunner } from 'typeorm';

const databaseUrl = process.env.CASE_WORKFLOW_TEST_DATABASE_URL;
const integrationDescribe = databaseUrl ? describe : describe.skip;
const suffix = String(process.pid);
const itemTable = `cw_it_items_${suffix}`;
const lineTable = `cw_it_lines_${suffix}`;

integrationDescribe('case-workflow MariaDB concurrency', () => {
  let dataSource: DataSource;

  beforeAll(async () => {
    dataSource = new DataSource({
      type: 'mariadb',
      url: databaseUrl,
      extra: { connectionLimit: 4, connectTimeout: 10_000 },
    });
    await dataSource.initialize();
    await dataSource.query(`
      CREATE TABLE ${itemTable} (
        id varchar(36) NOT NULL,
        tenant_id int NOT NULL,
        source_event_key varchar(180) NOT NULL,
        status varchar(30) NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_source (tenant_id, source_event_key)
      ) ENGINE=InnoDB
    `);
    await dataSource.query(`
      CREATE TABLE ${lineTable} (
        id varchar(36) NOT NULL,
        tenant_id int NOT NULL,
        billable_item_id varchar(36) NOT NULL,
        PRIMARY KEY (id),
        UNIQUE KEY uq_line (tenant_id, billable_item_id)
      ) ENGINE=InnoDB
    `);
  });

  afterAll(async () => {
    if (!dataSource?.isInitialized) return;
    await dataSource.query(`DROP TABLE IF EXISTS ${lineTable}`);
    await dataSource.query(`DROP TABLE IF EXISTS ${itemTable}`);
    await dataSource.destroy();
  });

  it('isole la clé source par tenant et refuse un doublon dans le même tenant', async () => {
    await dataSource.query(
      `INSERT INTO ${itemTable} VALUES ('a', 1, 'ACTION:1', 'TO_INVOICE')`,
    );
    await dataSource.query(
      `INSERT INTO ${itemTable} VALUES ('b', 2, 'ACTION:1', 'TO_INVOICE')`,
    );
    await expect(
      dataSource.query(
        `INSERT INTO ${itemTable} VALUES ('c', 1, 'ACTION:1', 'TO_INVOICE')`,
      ),
    ).rejects.toBeDefined();
  });

  it('ne produit qu’une ligne lors de deux facturations simultanées', async () => {
    await dataSource.query(
      `INSERT INTO ${itemTable} VALUES ('concurrent', 1, 'ACTION:2', 'TO_INVOICE')`,
    );

    const invoice = async (lineId: string): Promise<boolean> => {
      const runner = dataSource.createQueryRunner();
      await runner.connect();
      await runner.startTransaction();
      try {
        const rows = (await runner.query(
          `SELECT status FROM ${itemTable} WHERE id = 'concurrent' AND tenant_id = 1 FOR UPDATE`,
        )) as Array<{ status: string }>;
        if (rows[0]?.status !== 'TO_INVOICE') {
          await runner.rollbackTransaction();
          return false;
        }
        await runner.query(
          `INSERT INTO ${lineTable} VALUES (?, 1, 'concurrent')`,
          [lineId],
        );
        await runner.query(
          `UPDATE ${itemTable} SET status = 'INVOICED' WHERE id = 'concurrent' AND tenant_id = 1`,
        );
        await runner.commitTransaction();
        return true;
      } catch (error) {
        await thisRollback(runner);
        throw error;
      } finally {
        await runner.release();
      }
    };

    const results = await Promise.all([invoice('line-a'), invoice('line-b')]);
    expect(results.filter(Boolean)).toHaveLength(1);
    const count: unknown = await dataSource.query(
      `SELECT COUNT(*) AS total FROM ${lineTable} WHERE billable_item_id = 'concurrent'`,
    );
    if (!Array.isArray(count) || !count.length) {
      throw new Error(
        'Le résultat SQL du contrôle de concurrence est invalide',
      );
    }
    const firstRow = count[0] as Record<string, unknown>;
    expect(Number(firstRow.total)).toBe(1);
  });
});

async function thisRollback(runner: QueryRunner): Promise<void> {
  if (runner.isTransactionActive) await runner.rollbackTransaction();
}
