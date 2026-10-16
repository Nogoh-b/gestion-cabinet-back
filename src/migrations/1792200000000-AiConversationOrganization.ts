import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Organisation de l'historique du chat IA.
 *
 * - `pinned_at` : conversation épinglée en tête de l'historique.
 * - `resource_type` / `resource_id` / `resource_label` : fiche à laquelle la
 *   conversation se rapporte (dossier, client…), pour l'afficher sous le titre
 *   et filtrer « Ce dossier ». Les conversations existantes reprennent la
 *   première référence de leur premier message utilisateur qui en cite une.
 */
export class AiConversationOrganization1792200000000 implements MigrationInterface {
  name = 'AiConversationOrganization1792200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE conversations_bot
         ADD COLUMN pinned_at DATETIME NULL,
         ADD COLUMN resource_type VARCHAR(40) NULL,
         ADD COLUMN resource_id VARCHAR(64) NULL,
         ADD COLUMN resource_label VARCHAR(255) NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX IDX_conversations_bot_resource
         ON conversations_bot (tenant_id, user_id, resource_type, resource_id)`,
    );

    // `references` est un mot réservé : toujours entre accents graves.
    // `updated_at = c.updated_at` neutralise ON UPDATE CURRENT_TIMESTAMP : la
    // date d'activité (ordre et regroupement de l'historique) ne doit pas bouger.
    await queryRunner.query(
      `UPDATE conversations_bot c
         JOIN (
           SELECT conversation_id, MIN(id) AS message_id
             FROM conversation_messages
            WHERE role = 'user'
              AND \`references\` IS NOT NULL
              AND JSON_LENGTH(\`references\`) > 0
            GROUP BY conversation_id
         ) first_ref ON first_ref.conversation_id = c.id
         JOIN conversation_messages m ON m.id = first_ref.message_id
          SET c.resource_type = LEFT(JSON_UNQUOTE(JSON_EXTRACT(m.\`references\`, '$[0].type')), 40),
              c.resource_id = LEFT(JSON_UNQUOTE(COALESCE(
                JSON_EXTRACT(m.\`references\`, '$[0].id'),
                JSON_EXTRACT(m.\`references\`, '$[0].data.id')
              )), 64),
              c.resource_label = LEFT(JSON_UNQUOTE(JSON_EXTRACT(m.\`references\`, '$[0].label')), 255),
              c.updated_at = c.updated_at
        WHERE c.resource_type IS NULL`,
    );
    // Seules les fiches identifiées sont conservées (pas de page ni de création).
    await queryRunner.query(
      `UPDATE conversations_bot
          SET resource_type = NULL, resource_id = NULL, resource_label = NULL, updated_at = updated_at
        WHERE resource_type IS NOT NULL
          AND (resource_id IS NULL OR resource_id IN ('', 'new', 'null')
               OR resource_type NOT IN ('dossier', 'client', 'customer', 'document', 'audience',
                 'facture', 'employee', 'diligence', 'supplier', 'referrer', 'expense', 'paiement',
                 'dossier_action'))`,
    );
    await queryRunner.query(
      `UPDATE conversations_bot SET resource_type = 'client', updated_at = updated_at WHERE resource_type = 'customer'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IDX_conversations_bot_resource ON conversations_bot`);
    await queryRunner.query(
      `ALTER TABLE conversations_bot
         DROP COLUMN resource_label,
         DROP COLUMN resource_id,
         DROP COLUMN resource_type,
         DROP COLUMN pinned_at`,
    );
  }
}
