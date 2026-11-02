import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Recrée les tables qui provenaient historiquement de `synchronize` mais qui
 * ne figurent pas dans le dump de référence expurgé. Toutes les créations sont
 * conditionnelles afin de préserver les bases réelles où elles existent déjà.
 */
export class RestoreMissingReferenceTables1785169033500
  implements MigrationInterface
{
  name = 'RestoreMissingReferenceTables1785169033500';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS plans (
        id INT NOT NULL AUTO_INCREMENT,
        name VARCHAR(100) NOT NULL,
        code VARCHAR(50) NOT NULL,
        description TEXT NULL,
        max_employees INT NOT NULL DEFAULT 5,
        max_storage_gb INT NOT NULL DEFAULT 10,
        max_dossiers INT NOT NULL DEFAULT 100,
        max_clients INT NOT NULL DEFAULT 200,
        max_branches INT NOT NULL DEFAULT 1,
        max_audiences INT NOT NULL DEFAULT -1,
        payroll_enabled TINYINT NOT NULL DEFAULT 0,
        max_payslips_per_month INT NULL,
        expenses_enabled TINYINT NOT NULL DEFAULT 0,
        max_expenses_per_month INT NULL,
        documents_enabled TINYINT NOT NULL DEFAULT 1,
        invoicing_enabled TINYINT NOT NULL DEFAULT 0,
        reporting_enabled TINYINT NOT NULL DEFAULT 0,
        support_level VARCHAR(30) NOT NULL DEFAULT 'community',
        ai_enabled TINYINT NOT NULL DEFAULT 0,
        ai_requests_per_month INT NULL,
        price_monthly DECIMAL(10,2) NOT NULL DEFAULT 0,
        price_yearly DECIMAL(10,2) NULL,
        features TEXT NULL,
        is_active TINYINT NOT NULL DEFAULT 1,
        trial_enabled TINYINT NOT NULL DEFAULT 0,
        trial_days INT NOT NULL DEFAULT 30,
        min_commitment_months INT NOT NULL DEFAULT 0,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
          ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_plans_code (code)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS cabinets (
        id INT NOT NULL AUTO_INCREMENT,
        code VARCHAR(12) NOT NULL,
        name VARCHAR(255) NOT NULL,
        status VARCHAR(255) NOT NULL DEFAULT 'trial',
        plan VARCHAR(255) NULL,
        plan_id INT NULL,
        routing_mode VARCHAR(255) NOT NULL DEFAULT 'path',
        trial_ends_at DATETIME NULL,
        logo LONGBLOB NULL,
        logo_mime VARCHAR(100) NULL,
        logo_file VARCHAR(255) NULL,
        brand_color VARCHAR(20) NULL,
        contact_email VARCHAR(255) NULL,
        contact_phone VARCHAR(50) NULL,
        address TEXT NULL,
        website VARCHAR(255) NULL,
        slogan TEXT NULL,
        email_footer TEXT NULL,
        theme_name ENUM(
          'ocean','silver','yellow','forest','sunset','rose'
        ) NOT NULL DEFAULT 'ocean',
        font_ui VARCHAR(50) NOT NULL DEFAULT 'inter',
        font_heading VARCHAR(50) NOT NULL DEFAULT 'inter',
        font_mono VARCHAR(50) NOT NULL DEFAULT 'jetbrains_mono',
        rccm VARCHAR(100) NULL,
        nina VARCHAR(100) NULL,
        bank_account VARCHAR(100) NULL,
        app_locale VARCHAR(10) NOT NULL DEFAULT 'fr',
        date_format VARCHAR(20) NOT NULL DEFAULT 'dd/MM/yyyy',
        currency VARCHAR(10) NOT NULL DEFAULT 'XAF',
        currency_symbol VARCHAR(20) NULL,
        currency_symbol_position ENUM('before','after')
          NOT NULL DEFAULT 'after',
        currency_decimals INT NOT NULL DEFAULT 0,
        currency_thousands_sep VARCHAR(5) NOT NULL DEFAULT ' ',
        currency_decimal_sep VARCHAR(5) NOT NULL DEFAULT ',',
        invoice_prefix VARCHAR(20) NOT NULL DEFAULT 'FAC-',
        invoice_padding INT NOT NULL DEFAULT 4,
        invoice_numbering_strategy ENUM('yearly','monthly','continuous')
          NOT NULL DEFAULT 'yearly',
        dossier_prefix VARCHAR(20) NOT NULL DEFAULT 'DOS-',
        invoice_number_format VARCHAR(60) NOT NULL
          DEFAULT '{PREFIX}{YYYY}-{NNNN}',
        dossier_number_format VARCHAR(60) NOT NULL
          DEFAULT '{PREFIX}{YYYY}-{NNNN}',
        default_tva_rate DECIMAL(5,2) NOT NULL DEFAULT 0,
        working_hours_start VARCHAR(5) NOT NULL DEFAULT '08:00',
        working_hours_end VARCHAR(5) NOT NULL DEFAULT '17:00',
        notification_email TINYINT NOT NULL DEFAULT 1,
        notification_sms TINYINT NOT NULL DEFAULT 0,
        smtp_config JSON NULL,
        dossier_opening_fee_enabled TINYINT NOT NULL DEFAULT 0,
        dossier_opening_fee DECIMAL(10,2) NOT NULL DEFAULT 0,
        dossier_opening_fee_tva DECIMAL(5,2) NOT NULL DEFAULT 0,
        dossier_opening_fee_label VARCHAR(255) NULL,
        payslip_template LONGTEXT NULL,
        invoice_template LONGTEXT NULL,
        dossier_template LONGTEXT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
          ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        UNIQUE KEY uq_cabinets_code (code),
        KEY idx_cabinets_plan (plan_id),
        CONSTRAINT fk_cabinets_plan
          FOREIGN KEY (plan_id) REFERENCES plans(id)
          ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS country (
        id INT NOT NULL AUTO_INCREMENT,
        name VARCHAR(45) NOT NULL,
        code VARCHAR(45) NOT NULL,
        population VARCHAR(45) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
          ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id)
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS region (
        id INT NOT NULL AUTO_INCREMENT,
        name VARCHAR(45) NULL,
        code VARCHAR(45) NULL,
        country_id INT NULL,
        population VARCHAR(45) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
          ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY idx_region_country (country_id),
        CONSTRAINT fk_region_country
          FOREIGN KEY (country_id) REFERENCES country(id)
          ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS division (
        id INT NOT NULL AUTO_INCREMENT,
        name VARCHAR(45) NULL,
        code VARCHAR(45) NULL,
        region_id INT NULL,
        population VARCHAR(45) NULL,
        status TINYINT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
          ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY idx_division_region (region_id),
        CONSTRAINT fk_division_region
          FOREIGN KEY (region_id) REFERENCES region(id)
          ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS districts (
        id INT NOT NULL AUTO_INCREMENT,
        name VARCHAR(45) NOT NULL,
        code VARCHAR(45) NOT NULL,
        division_id INT NULL,
        population VARCHAR(45) NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
          ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY idx_district_division (division_id),
        CONSTRAINT fk_district_division
          FOREIGN KEY (division_id) REFERENCES division(id)
          ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS location_city (
        id INT NOT NULL AUTO_INCREMENT,
        name VARCHAR(45) NULL,
        code VARCHAR(45) NULL,
        population BIGINT NULL,
        districts_id INT NULL,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
          ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id),
        KEY idx_location_city_district (districts_id),
        CONSTRAINT fk_location_city_district
          FOREIGN KEY (districts_id) REFERENCES districts(id)
          ON DELETE SET NULL
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS otp_codes (
        id INT NOT NULL AUTO_INCREMENT,
        email VARCHAR(255) NOT NULL,
        code VARCHAR(255) NOT NULL,
        expiresAt TIMESTAMP NOT NULL,
        used TINYINT NOT NULL DEFAULT 0,
        transactionType INT NOT NULL,
        amount DECIMAL(10,2) NOT NULL,
        provider VARCHAR(10) NOT NULL,
        savingsAccountCode VARCHAR(50) NOT NULL,
        targetSavingsAccountCode VARCHAR(50) NULL,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
          ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id)
      ) ENGINE=InnoDB
    `);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS otp_online_link (
        id INT NOT NULL AUTO_INCREMENT,
        email VARCHAR(255) NOT NULL,
        code VARCHAR(255) NOT NULL,
        expiresAt TIMESTAMP NOT NULL,
        used TINYINT NOT NULL DEFAULT 0,
        savingsAccountCode VARCHAR(50) NOT NULL,
        cotiCustomerCode VARCHAR(50) NULL,
        createdAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updatedAt DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6)
          ON UPDATE CURRENT_TIMESTAMP(6),
        PRIMARY KEY (id)
      ) ENGINE=InnoDB
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS type_customer_document_type (
        type_customer_id INT NOT NULL,
        document_type_id INT NOT NULL,
        PRIMARY KEY (type_customer_id, document_type_id),
        KEY idx_customer_document_type_document (document_type_id),
        CONSTRAINT fk_customer_document_type_customer
          FOREIGN KEY (type_customer_id) REFERENCES type_customer(id)
          ON DELETE CASCADE,
        CONSTRAINT fk_customer_document_type_document
          FOREIGN KEY (document_type_id) REFERENCES document_type(id)
          ON DELETE CASCADE
      ) ENGINE=InnoDB
    `);
  }

  async down(): Promise<void> {
    // Migration de réparation volontairement non destructive : ces tables
    // peuvent contenir des données historiques antérieures à leur versionnement.
  }
}
