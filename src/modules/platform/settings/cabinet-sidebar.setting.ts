import { DataSource, EntityManager } from 'typeorm';

/**
 * Bloc « formule » en bas de la sidebar des cabinets, piloté par la plateforme.
 * Fichier sans dépendance Nest : lu par PlansService sans importer le module
 * plateforme (même approche que `billing-settings.ts`).
 */
export const CABINET_SIDEBAR_METRICS = ['storage', 'ai_credits'] as const;
export type CabinetSidebarMetric = (typeof CABINET_SIDEBAR_METRICS)[number];

export const CABINET_SIDEBAR_DEFAULTS = {
  plan_block_visible: true,
  plan_block_clickable: true,
  /** Jauge affichée : stockage des documents ou consommation IA du mois. */
  plan_block_metric: 'storage' as CabinetSidebarMetric,
};

export interface CabinetSidebarDisplay {
  visible: boolean;
  clickable: boolean;
  metric: CabinetSidebarMetric;
}

export async function readCabinetSidebarDisplay(
  db: DataSource | EntityManager,
): Promise<CabinetSidebarDisplay> {
  let value: any = null;
  try {
    const rows: Array<{ value: any }> = await db.query(
      'SELECT value FROM platform_settings WHERE `key` = ? LIMIT 1',
      ['cabinet_sidebar'],
    );
    const raw = rows[0]?.value;
    value = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch {
    value = null;
  }
  const s = { ...CABINET_SIDEBAR_DEFAULTS, ...(value && typeof value === 'object' ? value : {}) };
  return {
    visible: s.plan_block_visible !== false,
    clickable: s.plan_block_clickable !== false,
    metric: CABINET_SIDEBAR_METRICS.includes(s.plan_block_metric) ? s.plan_block_metric : 'storage',
  };
}
