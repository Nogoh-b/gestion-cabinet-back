import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * `cabinets.ai_credits_override` — forfait IA réglé par la plateforme pour un
 * cabinet : NULL = celui du plan, -1 = illimité, sinon crédits par mois. Un
 * abonnement illimité offert ne rend plus l'IA illimitée d'office.
 */
export class CabinetAiCreditsOverride1795000000000 implements MigrationInterface {
  name = 'CabinetAiCreditsOverride1795000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('cabinets', 'ai_credits_override'))) {
      await queryRunner.addColumn(
        'cabinets',
        new TableColumn({ name: 'ai_credits_override', type: 'int', isNullable: true }),
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (await queryRunner.hasColumn('cabinets', 'ai_credits_override')) {
      await queryRunner.dropColumn('cabinets', 'ai_credits_override');
    }
  }
}
