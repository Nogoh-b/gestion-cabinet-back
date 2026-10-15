import { DataSource, EntityManager } from 'typeorm';

/**
 * Lecture des paramètres plateforme (table `platform_settings`) depuis le
 * module abonnements, sans dépendre du module plateforme (pas de cycle).
 * Les valeurs par défaut doivent rester alignées sur PLATFORM_SETTING_DEFAULTS.
 */
export const BILLING_DEFAULTS = {
  issuer: {
    name: 'KabySoft',
    legal_name: '',
    address: '',
    city: '',
    country: 'Cameroun',
    phone: '',
    email: '',
    website: '',
    tax_id: '',
    rccm: '',
  },
  receipts: { prefix: 'REC', footer_note: 'Merci pour votre confiance.' },
  reminders: { enabled: true, days_before: [7, 3, 1] as number[] },
  support: { email: '', phone: '' },
};

export type BillingSettingKey = keyof typeof BILLING_DEFAULTS;

export async function readBillingSetting<K extends BillingSettingKey>(
  db: DataSource | EntityManager,
  key: K,
): Promise<(typeof BILLING_DEFAULTS)[K]> {
  const defaults = BILLING_DEFAULTS[key];
  try {
    const rows: Array<{ value: any }> = await db.query(
      'SELECT value FROM platform_settings WHERE `key` = ? LIMIT 1',
      [key],
    );
    const raw = rows[0]?.value;
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!value || typeof value !== 'object') return { ...defaults };
    const out: Record<string, any> = { ...defaults };
    for (const k of Object.keys(defaults)) {
      if (value[k] !== undefined && value[k] !== null) out[k] = value[k];
    }
    return out as (typeof BILLING_DEFAULTS)[K];
  } catch {
    return { ...defaults };
  }
}
