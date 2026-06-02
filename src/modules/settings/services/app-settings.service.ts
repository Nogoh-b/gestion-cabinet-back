import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cabinet, parseLogoInput } from 'src/modules/cabinet/entities/cabinet.entity';
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
  constructor(
    @InjectRepository(Cabinet)
    private readonly cabinetRepository: Repository<Cabinet>,
  ) {}

  /** Champs réinitialisables par `reset()` (les valeurs par défaut métier). */
  private static readonly RESETTABLE_DEFAULTS: Partial<Cabinet> = {
    logo: null,
    logo_mime: null,
    slogan: null,
    theme_name: 'ocean',
    font_ui: 'inter',
    font_heading: 'inter',
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
    dossier_prefix: 'DOS-',
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

  async update(cabinetId: number, dto: AppSettingsDto): Promise<Cabinet> {
    const cabinet = await this.findByCabinet(cabinetId);
    // `logo_url` est un champ de transport (data-URI) → décodé en blob, pas un champ d'entité.
    const { logo_url, ...rest } = dto as AppSettingsDto & { logo_url?: string | null };
    Object.assign(cabinet, rest);
    const parsedLogo = parseLogoInput(logo_url);
    if (parsedLogo) {
      cabinet.logo = parsedLogo.logo;
      cabinet.logo_mime = parsedLogo.logo_mime;
    }
    return this.cabinetRepository.save(cabinet);
  }

  async reset(cabinetId: number): Promise<Cabinet> {
    const cabinet = await this.findByCabinet(cabinetId);
    Object.assign(cabinet, AppSettingsService.RESETTABLE_DEFAULTS);
    return this.cabinetRepository.save(cabinet);
  }
}
