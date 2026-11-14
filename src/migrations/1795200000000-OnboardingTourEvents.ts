import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * `onboarding_tour_events` — journal des visites guidées jouées : terminée ou
 * abandonnée, et à quelle étape. Sert aux statistiques de la console
 * plateforme et au suivi de l'équipe par l'administrateur du cabinet.
 */
export class OnboardingTourEvents1795200000000 implements MigrationInterface {
  name = 'OnboardingTourEvents1795200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('onboarding_tour_events')) return;
    await queryRunner.createTable(
      new Table({
        name: 'onboarding_tour_events',
        columns: [
          { name: 'id', type: 'int', isPrimary: true, isGenerated: true, generationStrategy: 'increment' },
          { name: 'tenant_id', type: 'int' },
          { name: 'user_id', type: 'int' },
          { name: 'tour_id', type: 'varchar', length: '64' },
          { name: 'version', type: 'int', default: 1 },
          { name: 'outcome', type: 'enum', enum: ['completed', 'abandoned'] },
          // Dernière étape affichée (1 = première) et nombre d'étapes jouées.
          { name: 'step_reached', type: 'int' },
          { name: 'steps_total', type: 'int' },
          // auto : première ouverture ; replay : relancée par l'utilisateur.
          { name: 'trigger', type: 'enum', enum: ['auto', 'replay'], default: "'auto'" },
          { name: 'created_at', type: 'datetime', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
    );
    await queryRunner.createIndex(
      'onboarding_tour_events',
      new TableIndex({ name: 'IDX_onboarding_tour_events_tenant_user', columnNames: ['tenant_id', 'user_id'] }),
    );
    await queryRunner.createIndex(
      'onboarding_tour_events',
      new TableIndex({ name: 'IDX_onboarding_tour_events_tour', columnNames: ['tour_id', 'created_at'] }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasTable('onboarding_tour_events')) {
      await queryRunner.dropTable('onboarding_tour_events');
    }
  }
}
