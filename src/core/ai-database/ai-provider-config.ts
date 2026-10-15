import { BadRequestException } from '@nestjs/common';
import type {
  AiCabinetConfig,
  AiProviderConfig,
} from 'src/modules/cabinet/entities/cabinet.entity';

/**
 * Configuration des moteurs IA — gérée par la PLATEFORME.
 *
 * - `platform_settings['ai']` : catalogue des fournisseurs personnalisés (clés
 *   chiffrées) + moteur par défaut de tous les cabinets (`active_provider` et
 *   son `model`). Absent → variables d'environnement serveur.
 * - `cabinets.ai_config` : EXCEPTION facultative posée par la plateforme pour un
 *   cabinet (`active_provider` + `providers[active].model`). Les cabinets ne la
 *   modifient plus eux-mêmes.
 */
export const PLATFORM_AI_SETTING_KEY = 'ai';

export type AiStoredConfig = AiCabinetConfig;

/** Une exception cabinet valide désigne un fournisseur actif. */
export function hasCabinetOverride(config: AiStoredConfig | null | undefined): boolean {
  return !!config?.active_provider;
}

/**
 * Configuration effective d'un cabinet = exception du cabinet si elle existe,
 * sinon moteur par défaut de la plateforme. Les fournisseurs personnalisés
 * (URL, clé) viennent toujours du catalogue plateforme ; l'exception n'apporte
 * que le choix du fournisseur et du modèle.
 *
 * Retourne `null` quand rien n'est configuré : le routeur retombe alors sur
 * les variables d'environnement (comportement historique).
 */
export function mergeAiConfigs(
  platform: AiStoredConfig | null | undefined,
  cabinet: AiStoredConfig | null | undefined,
): AiStoredConfig | null {
  const catalog = { ...(platform?.providers ?? {}) };

  if (hasCabinetOverride(cabinet)) {
    const active = cabinet!.active_provider!;
    const own = cabinet!.providers?.[active] ?? {};
    return {
      active_provider: active,
      providers: {
        ...catalog,
        // Données héritées (avant la migration) : URL/clé propres au cabinet
        // conservées si le catalogue ne connaît pas ce fournisseur.
        [active]: { ...(catalog[active] ?? own), model: own.model ?? catalog[active]?.model },
      },
    };
  }

  if (platform?.active_provider) {
    return { active_provider: platform.active_provider, providers: catalog };
  }

  // Ancienne configuration « à plat » d'un cabinet, sans fournisseur actif.
  if (cabinet && (cabinet.base_url || cabinet.api_key || cabinet.model)) {
    return cabinet;
  }

  return null;
}

// ── Validation des saisies ────────────────────────────────────────────────

export interface CustomAiProviderInput {
  label?: string;
  base_url?: string;
  model?: string;
  api_key?: string;
}

export function cleanProviderId(value?: string): string {
  const id = String(value ?? '').trim();
  if (!/^[a-z0-9_-]{2,80}$/i.test(id)) {
    throw new BadRequestException('Identifiant de fournisseur invalide');
  }
  return id;
}

export function cleanAiText(value: unknown, field: string, maxLength: number): string {
  const text = String(value ?? '').trim();
  if (!text || text.length > maxLength || /[\r\n\0]/.test(text)) {
    throw new BadRequestException(`${field} invalide`);
  }
  return text;
}

export function validateCustomProvider(
  body: CustomAiProviderInput,
  requireKey: boolean,
): AiProviderConfig {
  const label = cleanAiText(body.label, 'label', 80);
  const model = cleanAiText(body.model, 'model', 160);
  const apiKey = String(body.api_key ?? '').trim();
  if (requireKey && (!apiKey || apiKey.length > 1000 || /[\r\n\0]/.test(apiKey))) {
    throw new BadRequestException('api_key invalide');
  }

  let url: URL;
  try {
    url = new URL(cleanAiText(body.base_url, 'base_url', 500));
  } catch {
    throw new BadRequestException('base_url doit etre une URL valide');
  }
  const localDev =
    process.env.NODE_ENV !== 'production' &&
    ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(localDev && url.protocol === 'http:')) {
    throw new BadRequestException('base_url doit utiliser HTTPS');
  }
  if (url.username || url.password || url.search || url.hash) {
    throw new BadRequestException(
      'base_url ne doit contenir ni identifiants, ni parametres, ni fragment',
    );
  }

  return {
    label,
    base_url: url.toString().replace(/\/$/, ''),
    model,
    api_key: apiKey,
    is_custom: true,
  };
}

/** Lit une valeur JSON stockée (mariadb renvoie parfois une chaîne). */
export function parseStoredAiConfig(raw: unknown): AiStoredConfig | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
  return typeof raw === 'object' ? (raw as AiStoredConfig) : null;
}
