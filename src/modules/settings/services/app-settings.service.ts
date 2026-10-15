import { Injectable, NotFoundException } from '@nestjs/common';
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
import { AppSettingsDto } from '../dto/app-settings.dto';
import { APPEARANCE_FALLBACK } from '../appearance.constants';
import { mergeSmtpConfig } from '../smtp-config.util';

/**
 * Service de configuration du cabinet.
 *
 * ⚠️ La table `app_settings` a été fusionnée dans `cabinets`. Ce service opère
 * désormais directement sur l'entité `Cabinet` (source de configuration UNIQUE).
 * Le nom de classe est conservé pour limiter le churn d'imports.
 */
@Injectable()
export class AppSettingsService {
  constructor(
    @InjectRepository(Cabinet)
    private readonly cabinetRepository: Repository<Cabinet>,
  ) {}

  /** Champs réinitialisables par `reset()` (les valeurs par défaut métier). */
  private static readonly RESETTABLE_DEFAULTS: Partial<Cabinet> = {
    logo: null,
    logo_mime: null,
    logo_file: null,
    slogan: null,
    theme_name: APPEARANCE_FALLBACK.theme_name,
    font_ui: APPEARANCE_FALLBACK.font_ui,
    font_heading: APPEARANCE_FALLBACK.font_heading,
    font_mono: APPEARANCE_FALLBACK.font_mono,
    default_font_size: APPEARANCE_FALLBACK.font_size,
    default_sidebar_style: APPEARANCE_FALLBACK.sidebar_style,
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

  /** Exception IA posée par la plateforme pour ce cabinet (lecture seule ici). */
  async getAiConfig(cabinetId: number): Promise<AiCabinetConfig | null> {
    const cabinet = await this.findByCabinet(cabinetId);
    return cabinet.ai_config
      ? JSON.parse(JSON.stringify(cabinet.ai_config))
      : null;
  }

  async update(cabinetId: number, dto: AppSettingsDto): Promise<Cabinet> {
    const cabinet = await this.findByCabinet(cabinetId);
    const previousSmtpConfig = cabinet.smtp_config;
    // `logo_url` est un champ de transport (data-URI) → décodé en blob + fichier statique.
    // `ai_config` n'est plus modifiable par le cabinet : le moteur IA est géré par
    // la console plateforme (module « Intelligence artificielle »).
    const { logo_url, ai_config: _ignored, ...rest } = dto as AppSettingsDto & {
      logo_url?: string | null;
      ai_config?: unknown;
    };
    Object.assign(cabinet, rest);
    if (rest.smtp_config !== undefined) {
      // Un mot de passe masqué/vide renvoyé par l'écran ne remplace pas l'existant.
      cabinet.smtp_config = mergeSmtpConfig(
        rest.smtp_config,
        previousSmtpConfig,
      );
    }
    applyLogoInput(cabinet, logo_url);
    return this.cabinetRepository.save(cabinet);
  }

  async reset(cabinetId: number): Promise<Cabinet> {
    const cabinet = await this.findByCabinet(cabinetId);
    // Supprime le fichier logo existant avant de remettre les valeurs par défaut.
    deleteLogoFile(cabinet.logo_file);
    Object.assign(cabinet, AppSettingsService.RESETTABLE_DEFAULTS);
    return this.cabinetRepository.save(cabinet);
  }
}
