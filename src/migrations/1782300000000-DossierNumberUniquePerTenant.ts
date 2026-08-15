import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rend le numéro de dossier unique PAR cabinet au lieu de globalement.
 *
 * L'entité déclarait `@Column({ ..., unique: true })` sur `dossier_number`, ce
 * qui matérialisait un index unique GLOBAL (IDX_d4463ab6224f4001e366eb8b59) sur
 * la seule colonne `dossier_number`. Or la génération du numéro est scopée par
 * tenant : deux cabinets fraîchement créés calculent tous deux `DOS-2026-0001`,
 * et le 2ᵉ INSERT explosait (Duplicate entry).
 *
 * Correctif : index unique composite (tenant_id, dossier_number).
 *
 * Idempotent : la base de dev tourne en `synchronize:true` et a pu déjà
 * appliquer le nouveau schéma. On teste l'existence des index avant d'agir.
 * Aucun risque de doublon lors de la création de l'index composite : l'ancien
 * index global garantissait déjà l'unicité de `dossier_number` seul.
 */
export class DossierNumberUniquePerTenant1782300000000 implements MigrationInterface {
  private async singleColumnUniqueIndexes(
    queryRunner: QueryRunner,
    column: string,
  ): Promise<string[]> {
    const rows: Array<{ INDEX_NAME: string }> = await queryRunner.query(
      `SELECT INDEX_NAME
         FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'dossiers'
          AND NON_UNIQUE = 0
          AND INDEX_NAME <> 'PRIMARY'
        GROUP BY INDEX_NAME
        HAVING COUNT(*) = 1 AND MAX(COLUMN_NAME) = '${column}'`,
    );
    return rows.map((r) => r.INDEX_NAME);
  }

  private async indexExists(queryRunner: QueryRunner, name: string): Promise<boolean> {
    const rows: Array<unknown> = await queryRunner.query(
      `SELECT 1 FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'dossiers'
          AND INDEX_NAME = '${name}' LIMIT 1`,
    );
    return rows.length > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Créer l'index composite s'il n'existe pas encore.
    if (!(await this.indexExists(queryRunner, 'UQ_dossiers_tenant_dossier_number'))) {
      await queryRunner.query(
        `CREATE UNIQUE INDEX UQ_dossiers_tenant_dossier_number
           ON dossiers (tenant_id, dossier_number)`,
      );
    }

    // 2. Supprimer l'ancien index unique global sur dossier_number seul.
    for (const name of await this.singleColumnUniqueIndexes(queryRunner, 'dossier_number')) {
      await queryRunner.query(`DROP INDEX \`${name}\` ON dossiers`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restaurer l'unicité globale sur dossier_number seul.
    const rows: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM (
         SELECT dossier_number FROM dossiers
         GROUP BY dossier_number HAVING COUNT(*) > 1
       ) t`,
    );
    // Ne pas recréer l'unicité globale si des doublons cross-tenant existent.
    if (rows[0]?.c === 0 && !(await this.indexExists(queryRunner, 'IDX_dossier_number_global'))) {
      await queryRunner.query(
        `CREATE UNIQUE INDEX IDX_dossier_number_global ON dossiers (dossier_number)`,
      );
    }

    if (await this.indexExists(queryRunner, 'UQ_dossiers_tenant_dossier_number')) {
      await queryRunner.query(
        `DROP INDEX \`UQ_dossiers_tenant_dossier_number\` ON dossiers`,
      );
    }
  }
}
