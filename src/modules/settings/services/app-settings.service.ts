import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  AiCabinetConfig,
  Cabinet,
  serializeCabinet,
} from 'src/modules/cabinet/entities/cabinet.entity';
import { ReferenceDataService } from '../../reference-data/reference-data.service';
import { APPEARANCE_FALLBACK } from '../appearance.constants';
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
/** Taille maximale du dictionnaire d'un cabinet. */
export const DICTIONARY_LIMIT = 5000;

/** Mot du dictionnaire : lettres, apostrophes et traits d'union, 1 à 60 caractères. */
export function normalizeDictionaryWord(word: unknown): string | null {
  const value = String(word ?? '')
    .trim()
    .replace(/’/g, "'");
  return /^[p{L}][p{L}'-]{0,59}$/u.test(value) ? value : null;
}

@Injectable()
export class AppSettingsService {
  constructor(
    @InjectRepository(Cabinet)
    private readonly cabinetRepository: Repository<Cabinet>,
    private readonly references: ReferenceDataService,
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

  /** Mots ajoutés au correcteur d'orthographe des éditeurs par le cabinet. */
  async dictionary(cabinetId: number): Promise<string[]> {
    const cabinet = await this.findByCabinet(cabinetId);
    return Array.isArray(cabinet.custom_dictionary)
      ? cabinet.custom_dictionary
      : [];
  }

  /**
   * Ajoute des mots au dictionnaire du cabinet (sans doublon, 5 000 mots au
   * plus) ; écriture ciblée de la seule colonne (pas de `save` du cabinet).
   */
  async addDictionaryWords(
    cabinetId: number,
    words: string[],
  ): Promise<string[]> {
    const current = await this.dictionary(cabinetId);
    const known = new Set(current);
    const added = words
      .map(normalizeDictionaryWord)
      .filter((word): word is string => !!word && !known.has(word));
    if (!added.length) return current;
    const next = [...current, ...new Set(added)].slice(-DICTIONARY_LIMIT);
    await this.cabinetRepository.update(
      { id: cabinetId },
      { custom_dictionary: next },
    );
    return next;
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
    // `logo_url` est un champ de transport (data-URI) → décodé en blob + fichier statique.
    // `ai_config` n'est plus modifiable par le cabinet : le moteur IA est géré par
    // la console plateforme (module « Intelligence artificielle »).
    const {
      logo_url,
      smtp_config,
      ai_config: _ignored,
      ...rest
    } = dto as AppSettingsDto & {
      logo_url?: string | null;
      ai_config?: unknown;
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
    Object.assign(
      cabinet,
      AppSettingsService.RESETTABLE_DEFAULTS,
      await this.references.initialSettings(cabinetId),
    );
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
