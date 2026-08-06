import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddValidatedInvoiceStatusAndMoneyPrecision1785169021000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE factures
       MODIFY COLUMN status ENUM('0','1','2','3','4','5','6')
       NOT NULL DEFAULT '0'`,
    );
    await queryRunner.query(
      `ALTER TABLE factures
       MODIFY COLUMN montant_ht DECIMAL(18,2) NOT NULL,
       MODIFY COLUMN montant_tva DECIMAL(18,2) NOT NULL,
       MODIFY COLUMN montant_ttc DECIMAL(18,2) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE paiements
       MODIFY COLUMN montant DECIMAL(18,2) NOT NULL`,
    );
    if (!(await queryRunner.hasTable('lignes_ecriture_comptable'))) {
      await queryRunner.query(`
        CREATE TABLE lignes_ecriture_comptable (
          id INT NOT NULL AUTO_INCREMENT,
          ecriture_id INT NOT NULL,
          compte_id INT NOT NULL,
          debit DECIMAL(18,2) NOT NULL DEFAULT 0,
          credit DECIMAL(18,2) NOT NULL DEFAULT 0,
          libelle VARCHAR(500) NULL,
          PRIMARY KEY (id),
          KEY idx_ligne_ecriture (ecriture_id),
          KEY idx_ligne_compte (compte_id),
          CONSTRAINT fk_ligne_ecriture
            FOREIGN KEY (ecriture_id) REFERENCES ecritures_comptables(id)
            ON DELETE CASCADE,
          CONSTRAINT fk_ligne_compte
            FOREIGN KEY (compte_id) REFERENCES comptes_comptables(id)
            ON DELETE RESTRICT
        ) ENGINE=InnoDB
      `);
    } else {
      await queryRunner.query(
        `ALTER TABLE lignes_ecriture_comptable
         MODIFY COLUMN debit DECIMAL(18,2) NOT NULL DEFAULT 0,
         MODIFY COLUMN credit DECIMAL(18,2) NOT NULL DEFAULT 0`,
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE paiements
       MODIFY COLUMN montant DECIMAL(10,2) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE factures
       MODIFY COLUMN status ENUM('0','1','2','3','4','5')
       NOT NULL DEFAULT '0',
       MODIFY COLUMN montant_ht DECIMAL(10,2) NOT NULL,
       MODIFY COLUMN montant_tva DECIMAL(10,2) NOT NULL,
       MODIFY COLUMN montant_ttc DECIMAL(10,2) NOT NULL`,
    );
    if (await queryRunner.hasTable('lignes_ecriture_comptable')) {
      await queryRunner.query(
        `ALTER TABLE lignes_ecriture_comptable
         MODIFY COLUMN debit DECIMAL(15,2) NOT NULL DEFAULT 0,
         MODIFY COLUMN credit DECIMAL(15,2) NOT NULL DEFAULT 0`,
      );
    }
  }
}
