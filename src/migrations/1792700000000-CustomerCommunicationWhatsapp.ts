import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Journal des communications client : type « whatsapp » pour les messages
 * préparés par le chat (compétence « Préparer un WhatsApp ») et envoyés
 * depuis le WhatsApp de l'utilisateur.
 */
export class CustomerCommunicationWhatsapp1792700000000 implements MigrationInterface {
  name = 'CustomerCommunicationWhatsapp1792700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE customer_communication
         MODIFY type ENUM('email', 'phone', 'meeting', 'letter', 'whatsapp') NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE customer_communication SET type = 'phone' WHERE type = 'whatsapp'`,
    );
    await queryRunner.query(
      `ALTER TABLE customer_communication
         MODIFY type ENUM('email', 'phone', 'meeting', 'letter') NOT NULL`,
    );
  }
}
