import { MigrationInterface, QueryRunner } from "typeorm";

export class UpdateCabinetLogoToLongtext1779107127070 implements MigrationInterface {
    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE app_settings MODIFY cabinet_logo LONGTEXT
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE app_settings MODIFY cabinet_logo TEXT
        `);
    }
}