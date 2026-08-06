import { MigrationInterface, QueryRunner } from 'typeorm';

export class SecureNotificationActors1785169037000
  implements MigrationInterface
{
  name = 'SecureNotificationActors1785169037000';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE notifications MODIFY COLUMN user_id INT NULL',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `UPDATE notifications n
       SET n.user_id = (
         SELECT un.user_id
         FROM user_notifications un
         WHERE un.notification_id = n.id
         ORDER BY un.id ASC
         LIMIT 1
       )
       WHERE n.user_id IS NULL`,
    );
    const missing = await queryRunner.query(
      'SELECT COUNT(*) AS total FROM notifications WHERE user_id IS NULL',
    );
    if (Number(missing?.[0]?.total ?? 0) > 0) {
      throw new Error(
        'Rollback impossible : des notifications sans acteur ni destinataire subsistent.',
      );
    }
    await queryRunner.query(
      'ALTER TABLE notifications MODIFY COLUMN user_id INT NOT NULL',
    );
  }
}
