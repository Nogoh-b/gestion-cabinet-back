import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { PlatformSetting } from '../entities/platform-setting.entity';
import { PlatformAuditContext } from '../audit/platform-audit.context';
import {
  APPEARANCE_FALLBACK,
  AppearanceDefaults,
  FONT_KEY_PATTERN,
  isFontSize,
  isSidebarStyle,
  isThemeName,
} from 'src/modules/settings/appearance.constants';
import { WorkflowEngine } from 'src/modules/case-workflow/case-workflow.enums';
import {
  CABINET_SIDEBAR_DEFAULTS,
  CABINET_SIDEBAR_METRICS,
} from './cabinet-sidebar.setting';

/** Valeurs par défaut (et typage) des paramètres plateforme modifiables. */
export const PLATFORM_SETTING_DEFAULTS = {
  /** Identité émettrice des reçus / factures d'abonnement. */
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
  receipts: {
    prefix: 'REC',
    footer_note: 'Merci pour votre confiance.',
  },
  reminders: {
    enabled: true,
    days_before: [7, 3, 1] as number[],
  },
  billing: {
    currency: 'XAF',
    /** Délai avant qu'un paiement passerelle resté « en attente » soit échoué. */
    pending_payment_expiry_hours: 24,
  },
  support: {
    email: '',
    phone: '',
  },
  /** Apparence copiée sur chaque nouveau cabinet (puis sur ses membres). */
  appearance: { ...APPEARANCE_FALLBACK } as AppearanceDefaults,
  /**
   * Parcours des dossiers d'un nouveau cabinet, si son profil de référentiel
   * ne définit pas « Parcours dossier ». Les cabinets existants ne changent pas.
   */
  workflow: {
    new_cabinet_engine: WorkflowEngine.ACTIONS_V2 as WorkflowEngine,
  },
  /** Bloc « formule » de la sidebar des cabinets (tous les cabinets). */
  cabinet_sidebar: { ...CABINET_SIDEBAR_DEFAULTS },
};

export type PlatformSettings = typeof PLATFORM_SETTING_DEFAULTS;
export type PlatformSettingKey = keyof PlatformSettings;
const KEYS = Object.keys(PLATFORM_SETTING_DEFAULTS) as PlatformSettingKey[];

export function mergeSection<T extends Record<string, any>>(defaults: T, value: any): T {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { ...defaults };
  const out: Record<string, any> = { ...defaults };
  for (const key of Object.keys(defaults)) {
    if (value[key] !== undefined && value[key] !== null) out[key] = value[key];
  }
  return out as T;
}

@Injectable()
export class PlatformSettingsService {
  constructor(
    @InjectRepository(PlatformSetting)
    private readonly repo: Repository<PlatformSetting>,
  ) {}

  async getAll(): Promise<PlatformSettings> {
    const rows = await this.repo.find({ where: { key: In(KEYS) } });
    const byKey = new Map(rows.map((r) => [r.key, r.value]));
    const out = {} as PlatformSettings;
    for (const key of KEYS) {
      (out as any)[key] = mergeSection(
        PLATFORM_SETTING_DEFAULTS[key] as any,
        byKey.get(key),
      );
    }
    return out;
  }

  async get<K extends PlatformSettingKey>(key: K): Promise<PlatformSettings[K]> {
    const row = await this.repo.findOne({ where: { key } });
    return mergeSection(PLATFORM_SETTING_DEFAULTS[key] as any, row?.value) as PlatformSettings[K];
  }

  async update(patch: Partial<PlatformSettings>, adminId: number) {
    const before = await this.getAll();
    for (const [key, value] of Object.entries(patch ?? {})) {
      if (!KEYS.includes(key as PlatformSettingKey)) {
        throw new BadRequestException(`Paramètre inconnu : ${key}`);
      }
      const merged = mergeSection(
        (before as any)[key],
        this.sanitize(key as PlatformSettingKey, value),
      );
      await this.repo.save({ key, value: merged, updated_by_admin_id: adminId });
    }
    const after = await this.getAll();
    PlatformAuditContext.set({
      action: 'settings.update',
      targetType: 'platform_settings',
      before,
      after,
    });
    return after;
  }

  private sanitize(key: PlatformSettingKey, value: any) {
    if (!value || typeof value !== 'object') return {};
    if (key === 'reminders' && value.days_before !== undefined) {
      const days = (Array.isArray(value.days_before) ? value.days_before : [])
        .map((d: any) => Math.round(Number(d)))
        .filter((d: number) => Number.isFinite(d) && d > 0 && d <= 60);
      value = { ...value, days_before: [...new Set(days)].sort((a: any, b: any) => b - a) };
    }
    if (key === 'billing' && value.pending_payment_expiry_hours !== undefined) {
      const hours = Number(value.pending_payment_expiry_hours);
      if (!Number.isFinite(hours) || hours < 1 || hours > 720) {
        throw new BadRequestException('Délai d’expiration des paiements invalide (1 à 720 h).');
      }
    }
    if (key === 'receipts' && value.prefix !== undefined) {
      const prefix = String(value.prefix).trim().toUpperCase();
      if (!/^[A-Z0-9]{1,10}$/.test(prefix)) {
        throw new BadRequestException('Préfixe de reçu : 1 à 10 lettres ou chiffres.');
      }
      value = { ...value, prefix };
    }
    if (
      key === 'workflow' &&
      value.new_cabinet_engine !== undefined &&
      !Object.values(WorkflowEngine).includes(value.new_cabinet_engine)
    ) {
      throw new BadRequestException('Parcours des nouveaux cabinets invalide.');
    }
    if (key === 'cabinet_sidebar') {
      const out: Record<string, any> = {};
      for (const flag of ['plan_block_visible', 'plan_block_clickable'] as const) {
        if (value[flag] !== undefined) out[flag] = value[flag] === true;
      }
      if (value.plan_block_metric !== undefined) {
        if (!CABINET_SIDEBAR_METRICS.includes(value.plan_block_metric)) {
          throw new BadRequestException('Jauge du bloc formule invalide.');
        }
        out.plan_block_metric = value.plan_block_metric;
      }
      return out;
    }
    if (key === 'appearance') {
      const invalid = (field: string) => {
        throw new BadRequestException(`Apparence : valeur invalide pour « ${field} ».`);
      };
      if (value.theme_name !== undefined && !isThemeName(value.theme_name)) invalid('thème');
      if (value.font_size !== undefined && !isFontSize(value.font_size)) invalid('taille du texte');
      if (value.sidebar_style !== undefined && !isSidebarStyle(value.sidebar_style)) invalid('barre latérale');
      for (const font of ['font_ui', 'font_heading', 'font_mono'] as const) {
        if (value[font] !== undefined && !FONT_KEY_PATTERN.test(String(value[font]))) invalid('police');
      }
    }
    return value;
  }
}
