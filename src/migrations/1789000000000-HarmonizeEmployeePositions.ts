import { MigrationInterface, QueryRunner } from 'typeorm';

export class HarmonizeEmployeePositions1789000000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE employee MODIFY COLUMN position
      enum('avocat','collaborateur','juriste','comptable','secretaire','assistant','stagiaire','huissier','administratif')
      NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      "UPDATE employee SET position = 'assistant' WHERE position IN ('collaborateur','juriste')",
    );
    await queryRunner.query(
      "UPDATE employee SET position = 'administratif' WHERE position = 'comptable'",
    );
    await queryRunner.query(`
      ALTER TABLE employee MODIFY COLUMN position
      enum('avocat','secretaire','assistant','stagiaire','huissier','administratif')
      NOT NULL
    `);
  }
}
