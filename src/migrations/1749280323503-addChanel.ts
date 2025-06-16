import { MigrationInterface, QueryRunner } from "typeorm";


export class AddChanel1749280323503 implements MigrationInterface {

    public async up(queryRunner: QueryRunner): Promise<void> {
       /*await queryRunner.query(
      `
      INSERT INTO transaction_type (code, name, description, is_credit, fee_percentage, status)
      VALUES
        ('MIN_BALANCE',                'Balance minimum d'un compte',              'Depôt minimal nécéssaire pour ouvrir un compte',0, 0.00,1),
        ('OPEN_ACCOUNT',               'Ouverture  de produit',              'Événement d'ouverture de produit',          0, 0.00,1)
      ;
      `
    );*/
 }

    public async down(queryRunner: QueryRunner): Promise<void> {
      /*await queryRunner.query(
      `
      DELETE FROM transaction_type
      WHERE code IN (
        'MIN_BALANCE', 'OPEN_ACCOUNT'
      );
      `
    );*/
   }

}
