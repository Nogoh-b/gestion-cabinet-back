/**
 * Classement des conversations existantes d'après leurs liens (idempotent) :
 * discussion directe (`isGroup = 0`), groupe du cabinet (nom configuré),
 * chat de dossier (`dossiers.conversation_id`). Les autres restent `group`.
 *
 * Utilisé par la migration et par la resynchronisation des chats de dossier.
 * `tenantFilter` borne la mise à jour à un cabinet (`c.tenant_id = ?`).
 */
export function conversationTypeBackfill(tenantFilter = ''): string[] {
  const and = tenantFilter ? ` AND ${tenantFilter}` : '';
  return [
    `UPDATE \`conversation\` c SET c.\`type\` = 'direct' WHERE c.\`isGroup\` = 0${and}`,
    `UPDATE \`conversation\` c
       INNER JOIN \`cabinets\` cab
         ON cab.\`id\` = c.\`tenant_id\` AND cab.\`default_chat_group_name\` = c.\`name\`
       SET c.\`type\` = 'global'
       WHERE c.\`isGroup\` = 1${and}`,
    `UPDATE \`conversation\` c
       INNER JOIN \`dossiers\` d ON d.\`conversation_id\` = c.\`id\`
       SET c.\`type\` = 'dossier'
       WHERE 1 = 1${and}`,
  ];
}

export const CONVERSATION_TYPE_BACKFILL = conversationTypeBackfill();
