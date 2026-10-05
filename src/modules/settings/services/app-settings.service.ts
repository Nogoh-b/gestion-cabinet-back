import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AiCabinetConfig,
  Cabinet,
} from 'src/modules/cabinet/entities/cabinet.entity';
import {
  applyLogoInput,
  deleteLogoFile,
} from 'src/modules/cabinet/cabinet-logo.util';
import { AI_CONFIG_CHANGED_EVENT } from 'src/core/ai-database/ai-model-router.service';
import { AppSettingsDto } from '../dto/app-settings.dto';

/**
 * Service de configuration du cabinet.
 *
 * ⚠️ La table `app_settings` a été fusionnée dans `cabinets`. Ce service opère
 * désormais directement sur l'entité `Cabinet` (source de configuration UNIQUE).
 * Le nom de classe est conservé pour limiter le churn d'imports.
 */
@Injectable()
export class AppSettingsService {
  private readonly logger = new Logger(AppSettingsService.name);

  constructor(
    @InjectRepository(Cabinet)
    private readonly cabinetRepository: Repository<Cabinet>,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /** Champs réinitialisables par `reset()` (les valeurs par défaut métier). */
  private static readonly RESETTABLE_DEFAULTS: Partial<Cabinet> = {
    logo: null,
    logo_mime: null,
    logo_file: null,
    slogan: null,
    theme_name: 'ocean',
    font_ui: 'outfit',
    font_heading: 'outfit',
    font_mono: 'jetbrains_mono',
    rccm: null,
    nina: null,
    bank_account: null,
    app_locale: 'fr',
    date_format: 'dd/MM/yyyy',
    currency: 'XAF',
    invoice_prefix: 'FAC-',
    invoice_padding: 4,
    invoice_numbering_strategy: 'yearly',
    invoice_number_format: '{PREFIX}{YYYY}-{NNNN}',
    dossier_prefix: 'DOS-',
    dossier_number_format: '{PREFIX}{YYYY}-{NNNN}',
    working_hours_start: '08:00',
    working_hours_end: '17:00',
    notification_email: true,
    notification_sms: false,
    smtp_config: null,
    payslip_template: null,
    invoice_template: null,
    dossier_template: null,
  };

  /**
   * Récupère la configuration du cabinet (= tenant_id = cabinet.id).
   */
  async findByCabinet(cabinetId: number): Promise<Cabinet> {
    const cabinet = await this.cabinetRepository.findOne({
      where: { id: cabinetId },
    });
    if (!cabinet) {
      throw new NotFoundException(`Cabinet #${cabinetId} introuvable`);
    }
    return cabinet;
  }

  async getAiConfig(cabinetId: number): Promise<AiCabinetConfig | null> {
    const cabinet = await this.findByCabinet(cabinetId);
    return cabinet.ai_config
      ? JSON.parse(JSON.stringify(cabinet.ai_config))
      : null;
  }

  /**
   * Point d'ecriture dedie a l'administration IA. Le remplacement est
   * atomique et l'invalidation du routeur est emise juste apres la sauvegarde.
   */
  async saveAiConfig(
    cabinetId: number,
    config: AiCabinetConfig | null,
  ): Promise<AiCabinetConfig | null> {
    const cabinet = await this.findByCabinet(cabinetId);
    cabinet.ai_config = config;
    const saved = await this.cabinetRepository.save(cabinet);
    this.eventEmitter.emit(AI_CONFIG_CHANGED_EVENT, { tenantId: cabinetId });
    this.logger.log(
      `[AI-MODEL] config IA modifiee pour le cabinet #${cabinetId} - cache invalide`,
    );
    return saved.ai_config ? JSON.parse(JSON.stringify(saved.ai_config)) : null;
  }

  async update(cabinetId: number, dto: AppSettingsDto): Promise<Cabinet> {
    const cabinet = await this.findByCabinet(cabinetId);
    // `logo_url` est un champ de transport (data-URI) → décodé en blob + fichier statique.
    const { logo_url, ai_config, ...rest } = dto as AppSettingsDto & {
      logo_url?: string | null;
      ai_config?: any;
    };
    Object.assign(cabinet, rest);
    applyLogoInput(cabinet, logo_url);
    // ai_config : si la clé contient des • (masquée), on ne l'écrase pas
    if (ai_config !== undefined) {
      const merged = this.mergeAiConfig(cabinet.ai_config, ai_config);
      cabinet.ai_config = merged;
    }
    const saved = await this.cabinetRepository.save(cabinet);
    // La config IA du cabinet a changé (fournisseur, clé, modèle) : on prévient
    // le routeur pour qu'il purge son cache immédiatement — sans quoi le
    // changement n'aurait d'effet qu'après expiration du TTL (30 s).
    if (ai_config !== undefined) {
      this.eventEmitter.emit(AI_CONFIG_CHANGED_EVENT, { tenantId: cabinetId });
      this.logger.log(
        `[AI-MODEL] config IA modifiée pour le cabinet #${cabinetId} — cache invalidé`,
      );
    }
    return saved;
  }

  private mergeAiConfig(existing: any, incoming: any): any {
    if (incoming === null) return null;
    if (!incoming || typeof incoming !== 'object') return incoming;
    // Préserve les clés masquées (contenant •) : garde l'ancienne valeur
    const result = { ...(existing ?? {}), ...incoming };
    // Merge profond pour providers
    if (existing?.providers || incoming.providers) {
      result.providers = { ...(existing?.providers ?? {}) };
      for (const [k, v] of Object.entries(incoming.providers ?? {})) {
        const prev = existing?.providers?.[k] ?? {};
        const cur = v as any;
        // Si api_key contient •, on garde l'ancienne
        if (cur?.api_key?.includes('•') || cur?.api_key?.includes('•')) {
          cur.api_key = prev.api_key;
        }
        result.providers[k] = { ...prev, ...cur };
      }
    }
    if (incoming.api_key?.includes('•')) {
      result.api_key = existing?.api_key;
    }
    return result;
  }

  async reset(cabinetId: number): Promise<Cabinet> {
    const cabinet = await this.findByCabinet(cabinetId);
    // Supprime le fichier logo existant avant de remettre les valeurs par défaut.
    deleteLogoFile(cabinet.logo_file);
    Object.assign(cabinet, AppSettingsService.RESETTABLE_DEFAULTS);
    return this.cabinetRepository.save(cabinet);
  }
}
