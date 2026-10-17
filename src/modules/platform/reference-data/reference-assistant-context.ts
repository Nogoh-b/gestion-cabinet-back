import {
  ReferenceItem,
  itemId,
} from '../../reference-data/reference-data.types';
export interface ReferenceAssistantOptions {
  mode?: 'auto' | 'explain' | 'propose' | 'compare';
  selected_ids?: string[];
  provider_id?: string;
  model?: string;
  quality?: 'fast' | 'balanced' | 'precise';
}
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[_./:-]+/g, ' ');
export function selectReferenceContext(
  items: ReferenceItem[],
  question: string,
  kind?: string,
  selectedIds: string[] = [],
) {
  const selected = new Set(selectedIds),
    byId = new Map(items.map((item) => [itemId(item), item]));
  const query = normalize(question);
  const words = [
    ...new Set(
      query
        .split(/[^a-z0-9]+/)
        .filter(
          (word) =>
            word.length > 2 &&
            ![
              'les',
              'des',
              'une',
              'pour',
              'dans',
              'avec',
              'est',
              'sur',
              'aux',
              'que',
              'qui',
              'peux',
              'cette',
              'ces',
              'mon',
              'son',
              'comment',
              'explique',
              'ajoute',
              'aussi',
            ].includes(word),
        ),
    ),
  ];
  const ranked = items
    .map((item, index) => {
      const title = normalize(
        String(
          item.values.name ??
            item.values.label ??
            item.values.description ??
            item.key,
        ),
      );
      const text = normalize(
        item.key + ' ' + title + ' ' + String(item.values.description ?? ''),
      );
      const exact = [normalize(item.key), title].some(
        (name) => name.length > 2 && query.includes(name),
      );
      const score =
        (selected.has(itemId(item)) ? 10000 : 0) +
        (exact ? 1000 : 0) +
        words.reduce((sum, word) => sum + (text.includes(word) ? 12 : 0), 0) +
        (item.kind === kind ? 6 : 0);
      return { item, score, index };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const result = new Map<string, ReferenceItem>();
  const add = (item: ReferenceItem | undefined) => {
    if (!item || result.has(itemId(item))) return;
    result.set(itemId(item), item);
    for (const link of Object.values(item.links)) add(byId.get(itemId(link)));
    if (item.kind === 'roles')
      for (const code of item.values.permissions ?? [])
        add(byId.get('permissions/' + code));
    if (item.kind === 'document_types')
      for (const key of item.values.categories ?? [])
        add(byId.get('document_categories/' + key));
  };
  for (const id of selected) add(byId.get(id));
  for (const entry of ranked.filter((entry) => entry.score >= 12).slice(0, 35))
    add(entry.item);
  if (kind === 'roles' || kind === 'permissions') {
    for (const item of items.filter((item) => item.kind === 'roles')) add(item);
  }
  for (const entry of ranked) {
    if (result.size >= 110) break;
    add(entry.item);
  }
  // Include immediate children of explicitly selected procedure/family definitions.
  for (const item of items)
    if (
      Object.values(item.links).some((link) => selected.has(itemId(link))) &&
      result.size < 160
    )
      add(item);
  const context: ReferenceItem[] = [],
    truncated: string[] = [];
  let budget = 85000;
  for (const item of result.values()) {
    const limit = selected.has(itemId(item)) ? 18000 : 4000;
    const values = Object.fromEntries(
      Object.entries(item.values).map(([key, value]) => {
        if (typeof value === 'string' && value.length > limit) {
          truncated.push(itemId(item));
          return [key, value.slice(0, limit) + '\n[Contenu tronqué]'];
        }
        return [key, value];
      }),
    );
    const record = { ...item, values },
      size = JSON.stringify(record).length;
    if (size > budget) continue;
    context.push(record);
    budget -= size;
  }
  return {
    items: context,
    index: ranked.slice(0, 160).map(({ item }) => ({
      id: itemId(item),
      label: String(
        item.values.name ??
          item.values.label ??
          item.values.description ??
          item.key,
      ).slice(0, 160),
      active: item.active,
    })),
    truncated: [...new Set(truncated)].filter((id) =>
      context.some((item) => itemId(item) === id),
    ),
    total: items.length,
  };
}
