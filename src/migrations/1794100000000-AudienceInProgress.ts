import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Audiences « en cours » :
 *
 *  - `status` gagne la valeur '4' (IN_PROGRESS), posée par « Démarrer » ;
 *  - `started_at` / `ended_at` : horodatage de « Démarrer » / « Terminer ».
 *
 * L'enum est stocké en texte ('0'..'3') : on l'élargit sans toucher aux
 * lignes existantes.
 */
export class AudienceInProgress1794100000000 implements MigrationInterface {
  name = 'AudienceInProgress1794100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE \`audiences\` MODIFY \`status\` ENUM('0','1','2','3','4') NOT NULL DEFAULT '0'`,
    );
    if (!(await queryRunner.hasColumn('audiences', 'started_at'))) {
      await queryRunner.addColumn(
        'audiences',
        new TableColumn({
          name: 'started_at',
          type: 'datetime',
          isNullable: true,
        }),
      );
    }
    if (!(await queryRunner.hasColumn('audiences', 'ended_at'))) {
      await queryRunner.addColumn(
        'audiences',
        new TableColumn({
          name: 'ended_at',
          type: 'datetime',
          isNullable: true,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('audiences', 'ended_at')) {
      await queryRunner.dropColumn('audiences', 'ended_at');
    }
    if (await queryRunner.hasColumn('audiences', 'started_at')) {
      await queryRunner.dropColumn('audiences', 'started_at');
    }
    // Une audience en cours redevient programmée avant de retirer la valeur.
    await queryRunner.query(
      `UPDATE \`audiences\` SET \`status\` = '0' WHERE \`status\` = '4'`,
    );
    await queryRunner.query(
      `ALTER TABLE \`audiences\` MODIFY \`status\` ENUM('0','1','2','3') NOT NULL DEFAULT '0'`,
    );
  }
}
