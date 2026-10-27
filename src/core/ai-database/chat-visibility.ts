/**
 * Ce que le chat IA expose au navigateur.
 *
 * AI_CHAT_SHOW_SQL=true affiche les requêtes SQL générées et les tableaux de
 * résultats bruts sous chaque réponse (diagnostic). Désactivé par défaut : la
 * requête (qui révèle le schéma) n'est alors jamais envoyée, et seules quelques
 * lignes restent transmises pour que le chat relie les dossiers, clients…
 * cités dans la réponse à leur fiche.
 */
export function isSqlShownInChat(env: NodeJS.ProcessEnv = process.env): boolean {
  return /^(1|true|yes|on)$/i.test(String(env.AI_CHAT_SHOW_SQL ?? '').trim());
}

/** Lignes conservées pour construire les liens quand le détail est masqué. */
const LINKED_ROWS_LIMIT = 20;

type ChatPayload = Record<string, any>;

function hideInMetadata(metadata: unknown, showSql: boolean): unknown {
  if (typeof metadata !== 'string') return toChatPayload(metadata, showSql);
  try {
    return toChatPayload(JSON.parse(metadata), showSql);
  } catch {
    return metadata;
  }
}

export function toChatPayload<T>(payload: T, showSql = isSqlShownInChat()): T {
  if (showSql || !payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return payload;
  }
  const { sqlQuery: _sql, resultSets, results, metadata, ...rest } = payload as ChatPayload;
  return {
    ...rest,
    // L'historique expose aussi les métadonnées brutes du message (objet ou JSON).
    ...(metadata !== undefined && { metadata: hideInMetadata(metadata, showSql) }),
    ...(Array.isArray(results) && { results: results.slice(0, LINKED_ROWS_LIMIT) }),
    // Le titre et le volume de chaque recherche alimentent l'affichage des étapes.
    ...(Array.isArray(resultSets) && {
      sources: resultSets.map((set: ChatPayload) => ({
        title: set?.title,
        rowCount: set?.rowCount ?? set?.data?.length ?? 0,
      })),
    }),
  } as T;
}
