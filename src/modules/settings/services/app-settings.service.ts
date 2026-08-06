import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  Cabinet,
  serializeCabinet,
} from 'src/modules/cabinet/entities/cabinet.entity';
import { applyLogoInput, deleteLogoFile } from 'src/modules/cabinet/cabinet-logo.util';
import { AppSettingsDto, SmtpConfigDto } from '../dto/app-settings.dto';
import {
  decryptSmtpConfig,
  encryptSmtpConfig,
} from 'src/core/shared/emails/smtp-config.crypto';

export interface SmtpConfigView {
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  from?: string;
  has_password: boolean;
}

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
    smtp_config_encrypted: null,
    payslip_template: null,
    invoice_template: null,
    dossier_template: null,
  };

  /**
   * Récupère la configuration du cabinet (= tenant_id = cabinet.id).
   */
  async findByCabinet(cabinetId: number): Promise<Cabinet> {
    const cabinet = await this.cabinetRepository
      .createQueryBuilder('cabinet')
      .addSelect('cabinet.smtp_config_encrypted')
      .where('cabinet.id = :cabinetId', { cabinetId })
      .getOne();
    if (!cabinet) {
      throw new NotFoundException(`Cabinet #${cabinetId} introuvable`);
    }
    return cabinet;
  }

  async update(cabinetId: number, dto: AppSettingsDto): Promise<Cabinet> {
    const cabinet = await this.findByCabinet(cabinetId);
    // `logo_url` est un champ de transport (data-URI) → décodé en blob + fichier statique.
    const { logo_url, smtp_config, ...rest } = dto as AppSettingsDto & {
      logo_url?: string | null;
    };
    Object.assign(cabinet, rest);
    applyLogoInput(cabinet, logo_url);

    if (smtp_config === null) {
      cabinet.smtp_config = null;
      cabinet.smtp_config_encrypted = null;
    } else if (smtp_config !== undefined) {
      const existing = this.readSmtpConfig(cabinet);
      const normalized = this.normalizeSmtpConfig(smtp_config, existing);
      cabinet.smtp_config_encrypted = encryptSmtpConfig(
        normalized as Record<string, unknown>,
      );
      // L'ancienne colonne n'est plus une source de vérité et ne doit plus
      // conserver de secret en clair.
      cabinet.smtp_config = null;
    }

    return this.cabinetRepository.save(cabinet);
  }

  async reset(cabinetId: number): Promise<Cabinet> {
    const cabinet = await this.findByCabinet(cabinetId);
    // Supprime le fichier logo existant avant de remettre les valeurs par défaut.
    deleteLogoFile(cabinet.logo_file);
    Object.assign(cabinet, AppSettingsService.RESETTABLE_DEFAULTS);
    return this.cabinetRepository.save(cabinet);
  }

  toResponse(cabinet: Cabinet): ReturnType<typeof serializeCabinet> & {
    smtp_config: SmtpConfigView | null;
  } {
    const config = this.readSmtpConfig(cabinet);
    const safeConfig = config
      ? {
          host: config.host,
          port: config.port,
          secure: config.secure,
          user: config.user,
          from: config.from,
          has_password: !!config.pass,
        }
      : null;
    return {
      ...serializeCabinet(cabinet),
      smtp_config: safeConfig,
    };
  }

  readSmtpConfig(cabinet: Cabinet | null | undefined): SmtpConfigDto | null {
    if (!cabinet) return null;
    try {
      if (cabinet.smtp_config_encrypted) {
        return decryptSmtpConfig<SmtpConfigDto & Record<string, unknown>>(
          cabinet.smtp_config_encrypted,
        );
      }
      return (cabinet.smtp_config ?? null) as SmtpConfigDto | null;
    } catch {
      // Ne jamais révéler si l'échec vient de la clé ou de l'enveloppe.
      throw new InternalServerErrorException(
        'Configuration SMTP sécurisée indisponible.',
      );
    }
  }

  private normalizeSmtpConfig(
    input: SmtpConfigDto,
    existing: SmtpConfigDto | null,
  ): SmtpConfigDto {
    const text = (value: unknown, max: number): string | undefined => {
      if (value == null) return undefined;
      return String(value).trim().slice(0, max) || undefined;
    };
    const rawPort = Number(input.port);
    const port = Number.isInteger(rawPort) && rawPort >= 1 && rawPort <= 65535
      ? rawPort
      : undefined;
    const submittedPassword = text(input.pass, 1024);

    return {
      host: text(input.host, 255),
      port,
      secure: input.secure === true,
      user: text(input.user, 320),
      pass: submittedPassword ?? existing?.pass,
      from: text(input.from, 500),
    };
  }
}
