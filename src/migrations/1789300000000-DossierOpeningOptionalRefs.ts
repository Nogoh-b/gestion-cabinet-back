import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Ouverture de dossier simplifiee : l'avocat responsable, le type et le
 * sous-type de procedure deviennent optionnels (a completer plus tard),
 * et les frais d'ouverture specifiques au dossier sont stockes
 * (surcharge du montant configure du cabinet).
 */
export class DossierOpeningOptionalRefs1789300000000
  implements MigrationInterface
{
  name = 'DossierOpeningOptionalRefs1789300000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `dossiers` MODIFY `lawyer_id` int NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `dossiers` MODIFY `procedure_type_id` int NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `dossiers` MODIFY `procedure_subtype_id` int NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `dossiers` ADD `procedure_costs` decimal(10,2) NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE `dossiers` DROP COLUMN `procedure_costs`',
    );
    await queryRunner.query(
      'ALTER TABLE `dossiers` MODIFY `procedure_subtype_id` int NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `dossiers` MODIFY `procedure_type_id` int NOT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `dossiers` MODIFY `lawyer_id` int NOT NULL',
    );
  }
}
