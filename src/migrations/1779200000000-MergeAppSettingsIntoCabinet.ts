import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Fusionne la table `app_settings` dans `cabinets` (source de configuration UNIQUE).
 *
 * 1. Ajoute les colonnes de configuration sur `cabinets` (si absentes — la base
 *    de dev tourne en `synchronize:true`, elles peuvent déjà exister).
 * 2. Élargit `logo_url` en LONGTEXT (pour accueillir les logos base64).
 * 3. Recopie les données de `app_settings` → `cabinets` (jointure sur cabinet_id).
 * 4. Supprime la table `app_settings`.
 */
export class MergeAppSettingsIntoCabinet1779200000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    const COLUMNS: { name: string; ddl: string }[] = [
      { name: 'slogan', ddl: 'TEXT NULL' },
      { name: 'theme_name', ddl: `ENUM('ocean','silver','yellow','forest','sunset','rose') NOT NULL DEFAULT 'ocean'` },
      { name: 'font_ui', ddl: `VARCHAR(50) NOT NULL DEFAULT 'inter'` },
      { name: 'font_heading', ddl: `VARCHAR(50) NOT NULL DEFAULT 'inter'` },
      { name: 'font_mono', ddl: `VARCHAR(50) NOT NULL DEFAULT 'jetbrains_mono'` },
      { name: 'rccm', ddl: 'VARCHAR(100) NULL' },
      { name: 'nina', ddl: 'VARCHAR(100) NULL' },
      { name: 'bank_account', ddl: 'VARCHAR(100) NULL' },
      { name: 'app_locale', ddl: `VARCHAR(10) NOT NULL DEFAULT 'fr'` },
      { name: 'date_format', ddl: `VARCHAR(20) NOT NULL DEFAULT 'dd/MM/yyyy'` },
      { name: 'currency', ddl: `VARCHAR(10) NOT NULL DEFAULT 'XAF'` },
      { name: 'invoice_prefix', ddl: `VARCHAR(20) NOT NULL DEFAULT 'FAC-'` },
      { name: 'invoice_padding', ddl: 'INT NOT NULL DEFAULT 4' },
      { name: 'invoice_numbering_strategy', ddl: `ENUM('yearly','monthly','continuous') NOT NULL DEFAULT 'yearly'` },
      { name: 'dossier_prefix', ddl: `VARCHAR(20) NOT NULL DEFAULT 'DOS-'` },
      { name: 'working_hours_start', ddl: `VARCHAR(5) NOT NULL DEFAULT '08:00'` },
      { name: 'working_hours_end', ddl: `VARCHAR(5) NOT NULL DEFAULT '17:00'` },
      { name: 'notification_email', ddl: 'TINYINT NOT NULL DEFAULT 1' },
      { name: 'notification_sms', ddl: 'TINYINT NOT NULL DEFAULT 0' },
      { name: 'smtp_config', ddl: 'JSON NULL' },
      { name: 'payslip_template', ddl: 'LONGTEXT NULL' },
      { name: 'invoice_template', ddl: 'LONGTEXT NULL' },
      { name: 'dossier_template', ddl: 'LONGTEXT NULL' },
    ];

    // 1. Colonnes (idempotent)
    for (const col of COLUMNS) {
      const has = await queryRunner.hasColumn('cabinets', col.name);
      if (!has) {
        await queryRunner.query(
          `ALTER TABLE cabinets ADD COLUMN \`${col.name}\` ${col.ddl}`,
        );
      }
    }

    // 2. Logo en LONGTEXT. Certaines bases créées avec `synchronize:true`
    // possèdent déjà les colonnes binaires `logo` / `logo_mime`, sans avoir
    // connu l'ancienne colonne texte `logo_url`.
    if (await queryRunner.hasColumn('cabinets', 'logo_url')) {
      await queryRunner.query(
        `ALTER TABLE cabinets MODIFY logo_url LONGTEXT NULL`,
      );
    } else {
      await queryRunner.query(
        `ALTER TABLE cabinets ADD COLUMN logo_url LONGTEXT NULL`,
      );
    }

    // 3. Recopie depuis app_settings (si la table existe encore). Les versions
    // historiques de cette table n'ont pas toutes les mêmes colonnes : on ne
    // sélectionne que celles qui existent réellement dans la base migrée.
    const appSettingsTable = await queryRunner.getTable('app_settings');
    if (appSettingsTable) {
      const sourceColumns = new Set(
        appSettingsTable.columns.map((column) => column.name),
      );
      if (!sourceColumns.has('cabinet_id')) {
        throw new Error(
          'Impossible de fusionner app_settings sans la colonne cabinet_id',
        );
      }

      const mappings: { source: string; assignment: string }[] = [
        {
          source: 'cabinet_name',
          assignment:
            "c.name = COALESCE(NULLIF(NULLIF(a.cabinet_name, ''), 'MonCabinet'), c.name)",
        },
        {
          source: 'cabinet_logo',
          assignment:
            "c.logo_url = COALESCE(NULLIF(a.cabinet_logo, ''), c.logo_url)",
        },
        {
          source: 'cabinet_address',
          assignment:
            "c.address = COALESCE(NULLIF(a.cabinet_address, ''), c.address)",
        },
        {
          source: 'cabinet_email',
          assignment:
            "c.contact_email = COALESCE(NULLIF(a.cabinet_email, ''), c.contact_email)",
        },
        {
          source: 'cabinet_phone',
          assignment:
            "c.contact_phone = COALESCE(NULLIF(a.cabinet_phone, ''), c.contact_phone)",
        },
        {
          source: 'cabinet_website',
          assignment:
            "c.website = COALESCE(NULLIF(a.cabinet_website, ''), c.website)",
        },
        {
          source: 'cabinet_slogan',
          assignment:
            "c.slogan = COALESCE(NULLIF(a.cabinet_slogan, ''), c.slogan)",
        },
        { source: 'theme_name', assignment: 'c.theme_name = a.theme_name' },
        { source: 'font_ui', assignment: 'c.font_ui = a.font_ui' },
        {
          source: 'font_heading',
          assignment: 'c.font_heading = a.font_heading',
        },
        { source: 'font_mono', assignment: 'c.font_mono = a.font_mono' },
        {
          source: 'cabinet_rccm',
          assignment: "c.rccm = NULLIF(a.cabinet_rccm, '')",
        },
        {
          source: 'cabinet_nina',
          assignment: "c.nina = NULLIF(a.cabinet_nina, '')",
        },
        {
          source: 'cabinet_bank_account',
          assignment: "c.bank_account = NULLIF(a.cabinet_bank_account, '')",
        },
        { source: 'app_locale', assignment: 'c.app_locale = a.app_locale' },
        { source: 'date_format', assignment: 'c.date_format = a.date_format' },
        { source: 'currency', assignment: 'c.currency = a.currency' },
        {
          source: 'invoice_prefix',
          assignment: 'c.invoice_prefix = a.invoice_prefix',
        },
        {
          source: 'invoice_padding',
          assignment: 'c.invoice_padding = a.invoice_padding',
        },
        {
          source: 'invoice_numbering_strategy',
          assignment:
            'c.invoice_numbering_strategy = a.invoice_numbering_strategy',
        },
        {
          source: 'dossier_prefix',
          assignment: 'c.dossier_prefix = a.dossier_prefix',
        },
        {
          source: 'working_hours_start',
          assignment: 'c.working_hours_start = a.working_hours_start',
        },
        {
          source: 'working_hours_end',
          assignment: 'c.working_hours_end = a.working_hours_end',
        },
        {
          source: 'notification_email',
          assignment: 'c.notification_email = a.notification_email',
        },
        {
          source: 'notification_sms',
          assignment: 'c.notification_sms = a.notification_sms',
        },
        { source: 'smtp_config', assignment: 'c.smtp_config = a.smtp_config' },
        {
          source: 'payslip_template',
          assignment: 'c.payslip_template = a.payslip_template',
        },
        {
          source: 'invoice_template',
          assignment: 'c.invoice_template = a.invoice_template',
        },
        {
          source: 'dossier_template',
          assignment: 'c.dossier_template = a.dossier_template',
        },
      ];
      const assignments = mappings
        .filter(({ source }) => sourceColumns.has(source))
        .map(({ assignment }) => assignment);

      if (assignments.length === 0) {
        throw new Error(
          'Impossible de fusionner app_settings sans colonne de configuration reconnue',
        );
      }

      await queryRunner.query(`
        UPDATE cabinets c
        JOIN app_settings a ON a.cabinet_id = c.id
        SET
          ${assignments.join(',\n          ')}
      `);

      // 4. Suppression de l'ancienne table
      await queryRunner.query(`DROP TABLE app_settings`);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Recrée une table app_settings minimale et y recopie les données depuis cabinets.
    const hasAppSettings = await queryRunner.hasTable('app_settings');
    if (!hasAppSettings) {
      await queryRunner.query(`
        CREATE TABLE app_settings (
          id CHAR(36) NOT NULL PRIMARY KEY,
          cabinet_id INT NULL UNIQUE,
          cabinet_name VARCHAR(255) NOT NULL DEFAULT 'MonCabinet',
          cabinet_logo LONGTEXT NULL,
          theme_name ENUM('ocean','silver','yellow','forest','sunset','rose') NOT NULL DEFAULT 'ocean',
          font_ui VARCHAR(50) NOT NULL DEFAULT 'inter',
          font_heading VARCHAR(50) NOT NULL DEFAULT 'inter',
          font_mono VARCHAR(50) NOT NULL DEFAULT 'jetbrains_mono',
          cabinet_address TEXT NOT NULL,
          cabinet_phone VARCHAR(50) NOT NULL DEFAULT '',
          cabinet_email VARCHAR(255) NOT NULL DEFAULT '',
          cabinet_website VARCHAR(255) NOT NULL DEFAULT '',
          cabinet_slogan VARCHAR(255) NOT NULL DEFAULT '',
          cabinet_rccm VARCHAR(100) NOT NULL DEFAULT '',
          cabinet_nina VARCHAR(100) NOT NULL DEFAULT '',
          cabinet_bank_account VARCHAR(100) NOT NULL DEFAULT '',
          app_locale VARCHAR(10) NOT NULL DEFAULT 'fr',
          date_format VARCHAR(20) NOT NULL DEFAULT 'dd/MM/yyyy',
          currency VARCHAR(10) NOT NULL DEFAULT 'XAF',
          invoice_prefix VARCHAR(20) NOT NULL DEFAULT 'FAC-',
          invoice_padding INT NOT NULL DEFAULT 4,
          invoice_numbering_strategy ENUM('yearly','monthly','continuous') NOT NULL DEFAULT 'yearly',
          dossier_prefix VARCHAR(20) NOT NULL DEFAULT 'DOS-',
          working_hours_start VARCHAR(5) NOT NULL DEFAULT '08:00',
          working_hours_end VARCHAR(5) NOT NULL DEFAULT '17:00',
          notification_email TINYINT NOT NULL DEFAULT 1,
          notification_sms TINYINT NOT NULL DEFAULT 0,
          smtp_config JSON NULL,
          payslip_template TEXT NULL,
          invoice_template TEXT NULL,
          dossier_template TEXT NULL
        )
      `);
      await queryRunner.query(`
        INSERT INTO app_settings (
          id, cabinet_id, cabinet_name, cabinet_logo, theme_name, font_ui, font_heading, font_mono,
          cabinet_address, cabinet_phone, cabinet_email, cabinet_website, cabinet_slogan,
          cabinet_rccm, cabinet_nina, cabinet_bank_account, app_locale, date_format, currency,
          invoice_prefix, invoice_padding, invoice_numbering_strategy, dossier_prefix,
          working_hours_start, working_hours_end, notification_email, notification_sms,
          smtp_config, payslip_template, invoice_template, dossier_template
        )
        SELECT
          UUID(), c.id, c.name, c.logo_url, c.theme_name, c.font_ui, c.font_heading, c.font_mono,
          COALESCE(c.address, ''), COALESCE(c.contact_phone, ''), COALESCE(c.contact_email, ''),
          COALESCE(c.website, ''), COALESCE(c.slogan, ''),
          COALESCE(c.rccm, ''), COALESCE(c.nina, ''), COALESCE(c.bank_account, ''),
          c.app_locale, c.date_format, c.currency,
          c.invoice_prefix, c.invoice_padding, c.invoice_numbering_strategy, c.dossier_prefix,
          c.working_hours_start, c.working_hours_end, c.notification_email, c.notification_sms,
          c.smtp_config, c.payslip_template, c.invoice_template, c.dossier_template
        FROM cabinets c
      `);
    }
  }
}
