import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Le choix des moteurs IA passe du cabinet à la console plateforme.
 *
 * - Les fournisseurs PERSONNALISÉS (URL + clé chiffrée) déclarés par des
 *   cabinets rejoignent le catalogue plateforme `platform_settings['ai']`.
 * - Le choix actuel de chaque cabinet (fournisseur + modèle) est conservé sous
 *   forme d'EXCEPTION dans `cabinets.ai_config`, que seule la plateforme
 *   modifie désormais : aucun cabinet ne change de moteur au déploiement.
 * - Aucun moteur par défaut n'est imposé : les autres cabinets continuent
 *   d'utiliser la configuration serveur (variables d'environnement).
 *
 * Les configurations d'origine sont sauvegardées dans
 * `platform_settings['ai_legacy_cabinet_configs']` pour le `down()`.
 */
const BUILTIN_PROVIDERS = ['deepseek', 'glm', 'meta', 'freellm', 'google'];
const AI_KEY = 'ai';
const BACKUP_KEY = 'ai_legacy_cabinet_configs';

type Provider = Record<string, any>;
type AiConfig = { active_provider?: string; providers?: Record<string, Provider>; base_url?: string; api_key?: string; model?: string };

function parse(raw: unknown): any {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }
  return raw;
}

export class MoveAiConfigToPlatform1792100000000 implements MigrationInterface {
  name = 'MoveAiConfigToPlatform1792100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const [platformRow] = await queryRunner.query(
      'SELECT `value` FROM platform_settings WHERE `key` = ? LIMIT 1',
      [AI_KEY],
    );
    const platform: AiConfig = parse(platformRow?.value) ?? {};
    const catalog: Record<string, Provider> = { ...(platform.providers ?? {}) };

    const cabinets: Array<{ id: number; ai_config: unknown }> = await queryRunner.query(
      'SELECT id, ai_config FROM cabinets WHERE ai_config IS NOT NULL',
    );
    const backup: Record<string, unknown> = {};

    for (const row of cabinets) {
      const config: AiConfig | null = parse(row.ai_config);
      backup[String(row.id)] = config;
      if (!config || typeof config !== 'object') {
        await queryRunner.query('UPDATE cabinets SET ai_config = NULL WHERE id = ?', [row.id]);
        continue;
      }

      // 1. Fournisseurs personnalisés → catalogue plateforme.
      for (const [id, provider] of Object.entries(config.providers ?? {})) {
        if (BUILTIN_PROVIDERS.includes(id) || !provider?.base_url) continue;
        if (!catalog[id]) {
          catalog[id] = {
            label: provider.label || id,
            base_url: provider.base_url,
            model: provider.model,
            api_key: provider.api_key,
            is_custom: true,
          };
        }
      }

      // 2. Ancienne config « à plat » → fournisseur personnalisé dédié.
      let active = config.active_provider;
      let model = active ? config.providers?.[active]?.model : undefined;
      if (!active && config.base_url && config.model) {
        active = `custom_cabinet_${row.id}`;
        model = config.model;
        catalog[active] = {
          label: `Ancienne config du cabinet #${row.id}`,
          base_url: config.base_url,
          model: config.model,
          api_key: config.api_key,
          is_custom: true,
        };
      }

      // 3. Choix du cabinet → exception (fournisseur + modèle seulement).
      const known = !!active && (BUILTIN_PROVIDERS.includes(active) || !!catalog[active]);
      const override = known
        ? { active_provider: active, providers: { [active!]: model ? { model } : {} } }
        : null;
      await queryRunner.query('UPDATE cabinets SET ai_config = ? WHERE id = ?', [
        override ? JSON.stringify(override) : null,
        row.id,
      ]);
    }

    await this.upsert(queryRunner, AI_KEY, { ...platform, providers: catalog });
    const [existingBackup] = await queryRunner.query(
      'SELECT `key` FROM platform_settings WHERE `key` = ? LIMIT 1',
      [BACKUP_KEY],
    );
    if (!existingBackup) await this.upsert(queryRunner, BACKUP_KEY, backup);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const [backupRow] = await queryRunner.query(
      'SELECT `value` FROM platform_settings WHERE `key` = ? LIMIT 1',
      [BACKUP_KEY],
    );
    const backup: Record<string, unknown> = parse(backupRow?.value) ?? {};
    for (const [cabinetId, config] of Object.entries(backup)) {
      await queryRunner.query('UPDATE cabinets SET ai_config = ? WHERE id = ?', [
        config ? JSON.stringify(config) : null,
        Number(cabinetId),
      ]);
    }
    await queryRunner.query('DELETE FROM platform_settings WHERE `key` IN (?, ?)', [AI_KEY, BACKUP_KEY]);
  }

  private async upsert(queryRunner: QueryRunner, key: string, value: unknown) {
    await queryRunner.query(
      `INSERT INTO platform_settings (\`key\`, \`value\`) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE \`value\` = VALUES(\`value\`)`,
      [key, JSON.stringify(value)],
    );
  }
}
