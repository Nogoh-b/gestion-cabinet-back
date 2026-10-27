import { createHash } from 'crypto';

export interface ReferenceLink {
  kind: string;
  key: string;
}
export interface ReferenceItem {
  kind: string;
  key: string;
  active: boolean;
  values: Record<string, any>;
  links: Record<string, ReferenceLink>;
}
export interface ReferenceChange {
  item: ReferenceItem;
  before: ReferenceItem | null;
  baseline: ReferenceItem | null;
  local_id: string | null;
  action: 'create' | 'update' | 'disable' | 'unchanged' | 'conflict';
  fingerprint: string;
  reason?: string;
}
export function canonical(value: any): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  return `{${Object.keys(value)
    .filter((k) => value[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`)
    .join(',')}}`;
}
export function fingerprint(value: any): string {
  return createHash('sha256').update(canonical(value)).digest('hex');
}
export const itemId = (item: ReferenceLink) => `${item.kind}/${item.key}`;
export function orderItems(items: ReferenceItem[]): ReferenceItem[] {
  const byId = new Map(items.map((item) => [itemId(item), item]));
  const ordered: ReferenceItem[] = [],
    visited = new Set<string>(),
    visiting = new Set<string>();
  const visit = (item: ReferenceItem) => {
    const id = itemId(item);
    if (visited.has(id)) return;
    if (visiting.has(id)) throw new Error(`Dépendance circulaire : ${id}`);
    visiting.add(id);
    const dependencies = [
      ...Object.values(item.links),
      ...(item.kind === 'roles'
        ? (item.values.permissions ?? []).map((key: string) => ({
            kind: 'permissions',
            key,
          }))
        : []),
      ...(item.kind === 'document_types'
        ? (item.values.categories ?? []).map((key: string) => ({
            kind: 'document_categories',
            key,
          }))
        : []),
    ];
    for (const link of dependencies) {
      const dependency = byId.get(itemId(link));
      if (!dependency) throw new Error(`Référence absente : ${itemId(link)}`);
      visit(dependency);
    }
    visiting.delete(id);
    visited.add(id);
    ordered.push(item);
  };
  items.forEach(visit);
  return ordered;
}
