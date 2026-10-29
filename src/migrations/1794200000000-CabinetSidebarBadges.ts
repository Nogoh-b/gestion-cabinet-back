import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Sidebar : `cabinets.sidebar_badges_enabled` — active, cabinet par cabinet,
 * les badges de compteurs (dossiers urgents, audiences du jour, factures
 * impayées, documents en attente). Désactivé par défaut.
 */
export class CabinetSidebarBadges1794200000000 implements MigrationInterface {
  name = 'CabinetSidebarBadges1794200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('cabinets', 'sidebar_badges_enabled'))) {
      await queryRunner.addColumn(
        'cabinets',
        new TableColumn({
          name: 'sidebar_badges_enabled',
          type: 'boolean',
          default: false,
          isNullable: false,
        }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('cabinets', 'sidebar_badges_enabled')) {
      await queryRunner.dropColumn('cabinets', 'sidebar_badges_enabled');
    }
  }
}
