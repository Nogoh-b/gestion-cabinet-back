import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Une audience peut être planifiée avec sa seule date. L'heure reçoit une
 * valeur pratique par défaut ; la juridiction et le type restent à compléter.
 */
export class AudienceEssentialFields1789400000000
  implements MigrationInterface
{
  name = 'AudienceEssentialFields1789400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "ALTER TABLE `audiences` MODIFY `audience_time` varchar(10) NOT NULL DEFAULT '09:00'",
    );
    await queryRunner.query(
      'ALTER TABLE `audiences` MODIFY `jurisdiction_id` int NULL DEFAULT NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `audiences` MODIFY `audience_type_id` int NULL DEFAULT NULL',
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'UPDATE `audiences` SET `jurisdiction_id` = 1 WHERE `jurisdiction_id` IS NULL',
    );
    await queryRunner.query(
      'UPDATE `audiences` SET `audience_type_id` = 1 WHERE `audience_type_id` IS NULL',
    );
    await queryRunner.query(
      'ALTER TABLE `audiences` MODIFY `audience_type_id` int NULL DEFAULT 1',
    );
    await queryRunner.query(
      'ALTER TABLE `audiences` MODIFY `jurisdiction_id` int NOT NULL DEFAULT 1',
    );
    await queryRunner.query(
      'ALTER TABLE `audiences` MODIFY `audience_time` varchar(10) NOT NULL',
    );
  }
}
