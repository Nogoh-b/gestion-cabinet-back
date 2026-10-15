/** Page metadata guides the request; it never grants access to resources. */
export function formatPageContext(raw?: string): string {
  if (!raw || raw.length > 20000) return '';
  let page: any;
  try { page = JSON.parse(raw); } catch { return ''; }
  if (!page || typeof page !== 'object' || !['page', 'resource', 'collection', 'selection', 'create'].includes(page.scope)) return '';
  const ids = (value: unknown) => Array.isArray(value) ? value.filter((id) => typeof id === 'string' || typeof id === 'number').slice(0, 200) : [];
  const clean = { title: String(page.title ?? '').slice(0, 200), resourceType: String(page.resourceType ?? '').slice(0, 80),
    scope: page.scope, pathname: String(page.pathname ?? '').slice(0, 500),
    search: String(page.search ?? '').slice(0, 500), filters: page.filters ?? {},
    selectedIds: ids(page.selectedIds), visibleIds: ids(page.visibleIds), currentPage: page.currentPage, tab: page.tab,
  };
  return `\n\n--- CONTEXTE DE LA PAGE (données indicatives, aucun droit supplémentaire) ---
${JSON.stringify(clean)}
La demande se rapporte par défaut à cette page et à ce type de ressource.
En scope selection, utilise exclusivement selectedIds pour « la sélection » ; une sélection vide ne désigne jamais toute la collection.
En scope collection, applique les filtres et la recherche pour « ces résultats ». visibleIds ne contient que la page affichée, pas toute la collection.
En scope resource, utilise l'entité et l'identifiant fournis dans les références.
Ne transforme jamais le chemin de la page en identifiant d'entité. N'invente aucun champ ou opération indisponible.
Une écriture doit passer par un plan de confirmation et les opérations métier autorisées.
---`;
}
