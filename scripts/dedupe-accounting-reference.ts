/**
 * Dédoublonnage des référentiels comptables — prérequis de la migration
 * `TenantAccountingReferenceUniqueness1785169026000`.
 *
 * Cette migration pose des contraintes UNIQUE(tenant_id, …) sur
 * `comptes_comptables`, `journaux_comptables` et `exercices_comptables`, et
 * refuse de s'exécuter tant que des doublons existent (le schéma legacy n'a
 * jamais eu d'unicité sur ces colonnes : les doublons ont toujours été
 * possibles).
 *
 * Ce script applique la seule correction mécanique possible : pour chaque clé
 * en doublon, un survivant est conservé, les références (lignes d'écriture,
 * écritures) qui pointaient vers les autres lignes sont réaffectées vers le
 * survivant, puis les lignes en trop sont supprimées.
 *
 * Sécurité :
 *   - dry-run par défaut : les suppressions sont exécutées dans une
 *     transaction puis ANNULÉES (rollback), ce qui permet de vérifier le
 *     résultat final avant d'écrire pour de vrai ;
 *   - `--apply` seul écrit réellement ;
 *   - une ligne dont les colonnes métier diffèrent du survivant n'est jamais
 *     supprimée automatiquement (ce n'est pas un doublon, c'est un arbitrage
 *     comptable) : elle est signalée, sauf `--allow-divergent` ;
 *   - une ligne qui sert de survivant pour une autre clé n'est jamais supprimée.
 *
 * Usage :
 *   npx ts-node -r tsconfig-paths/register scripts/dedupe-accounting-reference.ts
 *   npx ts-node -r tsconfig-paths/register scripts/dedupe-accounting-reference.ts --apply
 */
import { config } from 'dotenv';
import { DataSource, QueryRunner } from 'typeorm';

config();

const APPLY = process.argv.includes('--apply');
const ALLOW_DIVERGENT = process.argv.includes('--allow-divergent');

type Row = Record<string, any>;

type Reference = { table: string; column: string };

type Target = {
  table: string;
  label: string;
  /** Chaque entrée est une clé UNIQUE à venir : les colonnes de la contrainte. */
  keys: string[][];
  /** Colonnes de FK à réaffecter avant suppression. */
  references: Reference[];
  /** Colonnes dont une différence interdit la suppression automatique. */
  cloneColumns: string[];
};

const TARGETS: Target[] = [
  {
    table: 'comptes_comptables',
    label: 'numéros de comptes',
    keys: [['tenant_id', 'numero']],
    references: [{ table: 'lignes_ecriture_comptable', column: 'compte_id' }],
    cloneColumns: ['libelle', 'typeCompte', 'classe'],
  },
  {
    table: 'journaux_comptables',
    label: 'codes et types de journaux',
    keys: [
      ['tenant_id', 'code'],
      ['tenant_id', 'typeJournal'],
    ],
    references: [{ table: 'ecritures_comptables', column: 'journal_id' }],
    cloneColumns: ['code', 'typeJournal', 'libelle'],
  },
  {
    table: 'exercices_comptables',
    label: 'années d’exercice',
    keys: [['tenant_id', 'annee']],
    references: [{ table: 'ecritures_comptables', column: 'exercice_id' }],
    cloneColumns: ['annee', 'date_debut', 'date_fin', 'statut'],
  },
];

type GroupPlan = {
  key: string[];
  keep: Row;
  drops: Row[];
  hasLiveRow: boolean;
};

function ident(name: string): string {
  return '`' + name.replace(/`/g, '``') + '`';
}

function format(value: unknown): string {
  if (value === null || value === undefined) return 'NULL';
  if (value instanceof Date) {
    return value.toISOString().slice(0, 19).replace('T', ' ');
  }
  return String(value);
}

function describe(key: string[], row: Row): string {
  return key.map((column) => `${column}=${format(row[column])}`).join(' ');
}

function isLive(row: Row, hasDeletedAt: boolean): boolean {
  return !hasDeletedAt || row.deleted_at === null || row.deleted_at === undefined;
}

async function exists(
  runner: QueryRunner,
  sql: string,
  parameters: unknown[],
): Promise<boolean> {
  const rows: Row[] = await runner.query(sql, parameters);
  return rows.length > 0;
}

function tableExists(runner: QueryRunner, table: string): Promise<boolean> {
  return exists(
    runner,
    `SELECT 1 AS present FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? LIMIT 1`,
    [table],
  );
}

function columnExists(
  runner: QueryRunner,
  table: string,
  column: string,
): Promise<boolean> {
  return exists(
    runner,
    `SELECT 1 AS present FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
        AND COLUMN_NAME = ? LIMIT 1`,
    [table, column],
  );
}

async function findGroups(
  runner: QueryRunner,
  table: string,
  key: string[],
  hasDeletedAt: boolean,
): Promise<GroupPlan[]> {
  const columns = key.map(ident).join(', ');
  const duplicates: Row[] = await runner.query(
    `SELECT ${columns}, COUNT(*) AS n
       FROM ${ident(table)}
      GROUP BY ${columns}
     HAVING COUNT(*) > 1
      ORDER BY ${columns}`,
  );

  const plans: GroupPlan[] = [];
  for (const duplicate of duplicates) {
    const where = key.map((column) => `${ident(column)} <=> ?`).join(' AND ');
    const rows: Row[] = await runner.query(
      `SELECT * FROM ${ident(table)} WHERE ${where} ORDER BY id`,
      key.map((column) => duplicate[column]),
    );
    if (rows.length < 2) continue;
    const live = rows.filter((row) => isLive(row, hasDeletedAt));
    const pool = live.length > 0 ? live : rows;
    plans.push({
      key,
      keep: pool[0],
      drops: rows.filter((row) => row.id !== pool[0].id),
      hasLiveRow: live.length > 0,
    });
  }
  return plans;
}

async function countReferences(
  runner: QueryRunner,
  references: Reference[],
  id: unknown,
): Promise<Array<{ reference: Reference; count: number }>> {
  const counts: Array<{ reference: Reference; count: number }> = [];
  for (const reference of references) {
    if (!(await tableExists(runner, reference.table))) continue;
    if (!(await columnExists(runner, reference.table, reference.column))) {
      continue;
    }
    const rows: Row[] = await runner.query(
      `SELECT COUNT(*) AS n FROM ${ident(reference.table)}
        WHERE ${ident(reference.column)} = ?`,
      [id],
    );
    counts.push({ reference, count: Number(rows[0]?.n ?? 0) });
  }
  return counts;
}

function divergences(keep: Row, drop: Row, columns: string[]): string[] {
  return columns
    .filter((column) => format(keep[column]) !== format(drop[column]))
    .map(
      (column) =>
        `${column}: gardé « ${format(keep[column])} » / supprimé « ${format(drop[column])} »`,
    );
}

async function main(): Promise<void> {
  const dataSource = new DataSource({
    type: 'mysql',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    username: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'core',
    entities: [],
    migrations: [],
    synchronize: false,
    logging: ['error'],
  });

  await dataSource.initialize();
  const runner = dataSource.createQueryRunner();
  await runner.connect();
  await runner.startTransaction();

  const database: Row[] = await runner.query('SELECT DATABASE() AS db');
  console.log(
    `Base : ${format(database[0]?.db)} — mode : ${
      APPLY ? 'APPLICATION' : 'DRY-RUN (rien ne sera conservé)'
    }`,
  );

  let planned = 0;
  let deleted = 0;
  const decisions: string[] = [];

  try {
    for (const target of TARGETS) {
      console.log(`\n=== ${target.table} — ${target.label} ===`);
      if (!(await tableExists(runner, target.table))) {
        console.log('  table absente : rien à faire');
        continue;
      }
      const hasDeletedAt = await columnExists(
        runner,
        target.table,
        'deleted_at',
      );

      // Passe 1 : tous les groupes en doublon, tous les survivants.
      const keepIds = new Set<number>();
      const plans: GroupPlan[] = [];
      for (const key of target.keys) {
        const groups = await findGroups(
          runner,
          target.table,
          key,
          hasDeletedAt,
        );
        for (const group of groups) {
          keepIds.add(Number(group.keep.id));
          plans.push(group);
        }
      }
      if (plans.length === 0) {
        console.log('  aucun doublon');
        continue;
      }

      // Passe 2 : réaffectation des références puis suppression.
      for (const group of plans) {
        const description = describe(group.key, group.keep);
        if (!group.hasLiveRow) {
          decisions.push(
            `${target.table} ${description} : aucune ligne vivante, survivant choisi par id`,
          );
        }
        for (const drop of group.drops) {
          planned++;
          const label = `${description} (garde id ${format(
            group.keep.id,
          )}, supprime id ${format(drop.id)})`;

          if (keepIds.has(Number(drop.id))) {
            decisions.push(
              `${label} : conservé car survivant d'une autre clé unique`,
            );
            console.log(`  [conflit] ${label} — laissé en place`);
            continue;
          }

          const differences = divergences(
            group.keep,
            drop,
            target.cloneColumns,
          );
          if (differences.length > 0 && !ALLOW_DIVERGENT) {
            decisions.push(
              `${label} : lignes différentes (${differences.join(' ; ')})`,
            );
            console.log(`  [à décider] ${label}`);
            for (const difference of differences) {
              console.log(`      ${difference}`);
            }
            continue;
          }

          const references = await countReferences(
            runner,
            target.references,
            drop.id,
          );
          for (const { reference, count } of references) {
            if (count === 0) continue;
            await runner.query(
              `UPDATE ${ident(reference.table)}
                  SET ${ident(reference.column)} = ?
                WHERE ${ident(reference.column)} = ?`,
              [group.keep.id, drop.id],
            );
            console.log(
              `  [réaffecté] ${reference.table}.${reference.column} : ${count} ligne(s) ${format(
                drop.id,
              )} → ${format(group.keep.id)}`,
            );
          }

          const result = await runner.query(
            `DELETE FROM ${ident(target.table)} WHERE id = ?`,
            [drop.id],
          );
          const affected = Number(result?.affectedRows ?? 0);
          if (affected !== 1) {
            throw new Error(
              `Suppression inattendue pour ${target.table} id ${format(
                drop.id,
              )} (${affected} ligne(s) affectée(s))`,
            );
          }
          deleted++;
          console.log(`  [supprimé] id ${format(drop.id)} — ${label}`);
        }
      }
    }

    // Vérification : plus aucun doublon sur aucune clé suivie.
    const remaining: string[] = [];
    for (const target of TARGETS) {
      if (!(await tableExists(runner, target.table))) continue;
      for (const key of target.keys) {
        const columns = key.map(ident).join(', ');
        const rows: Row[] = await runner.query(
          `SELECT ${columns}, COUNT(*) AS n FROM ${ident(target.table)}
            GROUP BY ${columns} HAVING COUNT(*) > 1 LIMIT 5`,
        );
        for (const row of rows) {
          remaining.push(
            `${target.table} ${describe(key, row)} × ${format(row.n)}`,
          );
        }
      }
    }

    console.log('\n=== Bilan ===');
    console.log(`  lignes à supprimer : ${planned}`);
    console.log(`  lignes supprimées  : ${deleted}`);
    if (decisions.length > 0) {
      console.log(`  à décider à la main : ${decisions.length}`);
      for (const decision of decisions) console.log(`    - ${decision}`);
    }
    if (remaining.length > 0) {
      console.log('  doublons restants :');
      for (const leftover of remaining) console.log(`    - ${leftover}`);
    } else {
      console.log('  doublons restants : aucun');
    }

    if (APPLY) {
      await runner.commitTransaction();
      console.log('\nModifications validées (COMMIT).');
      console.log(
        'Rejouez ensuite : npm run migration:run (ou migration:run:prod).',
      );
    } else {
      await runner.rollbackTransaction();
      console.log('\nDry-run : ROLLBACK, aucune modification conservée.');
      console.log('Relancez avec --apply pour écrire réellement.');
    }
  } catch (error) {
    await runner.rollbackTransaction();
    throw error;
  } finally {
    await runner.release();
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error(
    `\nÉchec du dédoublonnage — aucune modification conservée : ${
      error instanceof Error ? error.message : String(error)
    }`,
  );
  process.exitCode = 1;
});
