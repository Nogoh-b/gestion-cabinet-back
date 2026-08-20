import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rend le numéro de facture unique PAR cabinet au lieu de globalement.
 *
 * L'entité déclarait `@Column({ unique: true })` sur `numero`, ce qui
 * matérialisait un index unique GLOBAL (IDX_f1c7842d8a90f22a49d66639d0) sur
 * la seule colonne `numero`. Or la génération du numéro (generateFacNumber)
 * est scopée par tenant : deux cabinets calculent chacun légitimement
 * `FAC-2026-0001`, et le 2ᵉ INSERT explosait (Duplicate entry). Pire, la
 * boucle anti-collision régénère un numéro lui aussi scopé au tenant courant
 * et retombe donc systématiquement sur la même valeur, épuisant ses tentatives.
 *
 * Correctif : index unique composite (tenant_id, numero), à l'identique du
 * correctif déjà appliqué sur dossiers.dossier_number (voir
 * 1782300000000-DossierNumberUniquePerTenant.ts).
 *
 * Idempotent : la base de dev tourne en `synchronize:true` et a pu déjà
 * appliquer le nouveau schéma. On teste l'existence des index avant d'agir.
 * Aucun risque de doublon lors de la création de l'index composite : l'ancien
 * index global garantissait déjà l'unicité de `numero` seul.
 */
export class FactureNumeroUniquePerTenant1782500000000 implements MigrationInterface {
  private async singleColumnUniqueIndexes(
    queryRunner: QueryRunner,
    column: string,
  ): Promise<string[]> {
    const rows: Array<{ INDEX_NAME: string }> = await queryRunner.query(
      `SELECT INDEX_NAME
         FROM INFORMATION_SCHEMA.STATISTICS
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'factures'
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
          AND TABLE_NAME = 'factures'
          AND INDEX_NAME = '${name}' LIMIT 1`,
    );
    return rows.length > 0;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Créer l'index composite s'il n'existe pas encore.
    if (!(await this.indexExists(queryRunner, 'UQ_factures_tenant_numero'))) {
      await queryRunner.query(
        `CREATE UNIQUE INDEX UQ_factures_tenant_numero
           ON factures (tenant_id, numero)`,
      );
    }

    // 2. Supprimer l'ancien index unique global sur numero seul.
    for (const name of await this.singleColumnUniqueIndexes(queryRunner, 'numero')) {
      await queryRunner.query(`DROP INDEX \`${name}\` ON factures`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restaurer l'unicité globale sur numero seul.
    const rows: Array<{ c: number }> = await queryRunner.query(
      `SELECT COUNT(*) AS c FROM (
         SELECT numero FROM factures
         GROUP BY numero HAVING COUNT(*) > 1
       ) t`,
    );
    // Ne pas recréer l'unicité globale si des doublons cross-tenant existent.
    if (rows[0]?.c === 0 && !(await this.indexExists(queryRunner, 'IDX_numero_global'))) {
      await queryRunner.query(
        `CREATE UNIQUE INDEX IDX_numero_global ON factures (numero)`,
      );
    }

    if (await this.indexExists(queryRunner, 'UQ_factures_tenant_numero')) {
      await queryRunner.query(
        `DROP INDEX \`UQ_factures_tenant_numero\` ON factures`,
      );
    }
  }
}
