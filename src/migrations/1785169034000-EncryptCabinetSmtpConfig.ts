import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

import {
  decryptSmtpConfig,
  encryptSmtpConfig,
} from '../core/shared/emails/smtp-config.crypto';

interface CabinetSmtpRow {
  id: number;
  smtp_config: Record<string, unknown> | string | null;
  smtp_config_encrypted: string | null;
}

export class EncryptCabinetSmtpConfig1785169034000
  implements MigrationInterface
{
  name = 'EncryptCabinetSmtpConfig1785169034000';

  async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('cabinets', 'smtp_config_encrypted'))) {
      await queryRunner.addColumn(
        'cabinets',
        new TableColumn({
          name: 'smtp_config_encrypted',
          type: 'longtext',
          isNullable: true,
        }),
      );
    }

    const rows = await queryRunner.query(
      `SELECT id, smtp_config, smtp_config_encrypted
       FROM cabinets
       WHERE smtp_config IS NOT NULL OR smtp_config_encrypted IS NOT NULL`,
    ) as CabinetSmtpRow[];

    for (const row of rows) {
      if (row.smtp_config_encrypted || row.smtp_config == null) continue;
      const config = typeof row.smtp_config === 'string'
        ? JSON.parse(row.smtp_config) as Record<string, unknown>
        : row.smtp_config;
      const encrypted = encryptSmtpConfig(config);
      await queryRunner.query(
        `UPDATE cabinets
         SET smtp_config_encrypted = ?, smtp_config = NULL
         WHERE id = ? AND smtp_config_encrypted IS NULL`,
        [encrypted, row.id],
      );
    }
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await queryRunner.hasColumn('cabinets', 'smtp_config_encrypted'))) {
      return;
    }

    const rows = await queryRunner.query(
      `SELECT id, smtp_config_encrypted
       FROM cabinets
       WHERE smtp_config_encrypted IS NOT NULL`,
    ) as Array<{ id: number; smtp_config_encrypted: string }>;

    for (const row of rows) {
      const config = decryptSmtpConfig<Record<string, unknown>>(
        row.smtp_config_encrypted,
      );
      await queryRunner.query(
        'UPDATE cabinets SET smtp_config = ? WHERE id = ?',
        [JSON.stringify(config), row.id],
      );
    }

    await queryRunner.dropColumn('cabinets', 'smtp_config_encrypted');
  }
}
