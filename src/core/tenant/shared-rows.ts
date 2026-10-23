import { getCurrentTenantId, hasActiveTenant } from './tenant.context';

/**
 * Entités @SharedAcrossTenants (modèles de mails, de PDF, blocs) : un cabinet lit
 * celles du référentiel global (tenant 1) en plus des siennes, et reçoit une
 * copie des globales à sa création. Pour un même code, la copie du cabinet
 * l'emporte : sans cela chaque modèle apparaît en double et un code peut
 * désigner la ligne globale.
 */
export function preferOwnByCode<T extends { code: string; tenant_id?: number | null }>(rows: T[]): T[] {
  if (!hasActiveTenant()) return rows;
  const tenantId = getCurrentTenantId();
  const byCode = new Map<string, T>();
  for (const row of rows) {
    const kept = byCode.get(row.code);
    if (!kept || (kept.tenant_id !== tenantId && row.tenant_id === tenantId)) {
      byCode.set(row.code, row);
    }
  }
  return rows.filter((row) => byCode.get(row.code) === row);
}

/**
 * Ligne à modifier à la place d'une ligne globale vue par un cabinet : sa copie
 * (créée au besoin, non enregistrée). `save` réécrit tenant_id avec le cabinet
 * courant : sans cette redirection il déplacerait la ligne globale dans le
 * cabinet, ou violerait l'index unique (tenant, code) si la copie existe déjà.
 * Renvoie `row` telle quelle quand elle appartient déjà au cabinet.
 */
export function ownCopyOf<T extends { code: string; tenant_id?: number | null }>(
  row: T,
  findOwn: (code: string) => Promise<T | null>,
  build: (copy: Partial<T>) => T,
): Promise<T> {
  if (!hasActiveTenant() || row.tenant_id === getCurrentTenantId()) return Promise.resolve(row);
  return findOwn(row.code).then((own) => {
    if (own && own.tenant_id === getCurrentTenantId()) return own;
    const { id: _id, tenant_id: _tenant, created_at: _created, updated_at: _updated, deleted_at: _deleted, ...copy } = row as any;
    return build(copy as Partial<T>);
  });
}
