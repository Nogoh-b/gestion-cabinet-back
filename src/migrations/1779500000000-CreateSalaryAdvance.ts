import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Avance sur salaire — entité dédiée (découplée du bulletin mensuel).
 *
 * Une avance n'est plus une fiche de paie `is_advance`, mais un mouvement
 * autonome rattaché au collaborateur :
 *   - versement → écriture 425 (créance) / 512 (banque) ;
 *   - récupération automatique sur la (les) paie(s) suivante(s) via la ligne
 *     `advance_recovery` du bulletin (qui solde le 425).
 *
 * Idempotent (`CREATE TABLE IF NOT EXISTS`) car la base de dev tourne en
 * `synchronize:true` et a déjà pu matérialiser la table.
 */
export class CreateSalaryAdvance1779500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS salary_advance (
        id INT NOT NULL AUTO_INCREMENT,
        employee_id INT NOT NULL,
        amount DECIMAL(12,2) NOT NULL,
        recovered_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
        date_granted DATE NOT NULL,
        status ENUM('pending','approved','paid','recovered','cancelled') NOT NULL DEFAULT 'pending',
        payment_date DATE NULL,
        reason TEXT NULL,
        tenant_id INT NOT NULL DEFAULT 1,
        created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
        updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
        deleted_at DATETIME(6) NULL,
        PRIMARY KEY (id),
        INDEX IDX_salary_advance_tenant (tenant_id),
        INDEX IDX_salary_advance_employee (employee_id)
      ) ENGINE=InnoDB
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS salary_advance`);
  }
}
