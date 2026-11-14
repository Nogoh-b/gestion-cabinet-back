import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * `user_settings.onboarding_tours` — visites guidées déjà vues par
 * l'utilisateur : { seen: { [tourId]: "version@date ISO" }, disabled }.
 * NULL = aucune visite vue (nouvel utilisateur ou compteurs remis à zéro).
 */
export class UserSettingsOnboardingTours1795100000000 implements MigrationInterface {
  name = 'UserSettingsOnboardingTours1795100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('user_settings', 'onboarding_tours'))) {
      await queryRunner.addColumn(
        'user_settings',
        new TableColumn({ name: 'onboarding_tours', type: 'json', isNullable: true }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('user_settings', 'onboarding_tours')) {
      await queryRunner.dropColumn('user_settings', 'onboarding_tours');
    }
  }
}
