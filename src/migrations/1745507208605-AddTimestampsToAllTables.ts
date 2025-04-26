import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTimestampsToAllTables1745507208605 implements MigrationInterface {
public async up(queryRunner: QueryRunner): Promise<void> {
  /*const tables = await queryRunner.getTables();

  for (const table of tables) {
    const tableName = table.name;

    // Ne modifier que les tables de ton schéma, ignorer celles du système
    if (
      tableName.startsWith('information_schema') || 
      tableName.startsWith('mysql') ||
      tableName.startsWith('performance_schema') ||
      tableName.startsWith('sys')
    ) {
      continue;
    }

    if (!table.findColumnByName('created_at')) {
      await queryRunner.query(
        `ALTER TABLE \`${tableName}\` ADD COLUMN \`created_at\` DATETIME DEFAULT CURRENT_TIMESTAMP`
      );
    }

    if (!table.findColumnByName('updated_at')) {
      await queryRunner.query(
        `ALTER TABLE \`${tableName}\` ADD COLUMN \`updated_at\` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`
      );
    }

    if (!table.findColumnByName('deleted_at')) {
      await queryRunner.query(
        `ALTER TABLE \`${tableName}\` ADD COLUMN \`deleted_at\` DATETIME NULL`
      );
    }
  }*/
}



public async down(queryRunner: QueryRunner): Promise<void> {
  /*const tables = await queryRunner.getTables();

  for (const table of tables) {
    const tableName = table.name;

    if (table.findColumnByName('created_at')) {
      await queryRunner.query(`ALTER TABLE \`${tableName}\` DROP COLUMN \`created_at\``);
    }

    if (table.findColumnByName('updated_at')) {
      await queryRunner.query(`ALTER TABLE \`${tableName}\` DROP COLUMN \`updated_at\``);
    }

    if (table.findColumnByName('deleted_at')) {
      await queryRunner.query(`ALTER TABLE \`${tableName}\` DROP COLUMN \`deleted_at\``);
    }
  }*/
}

}
