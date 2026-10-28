import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

import { CABINET_TABLE } from 'src/core/ai-database/ai-scoped-tables';
import { WriteableFieldSchema } from 'src/core/ai-database/interface/entity-write-handler.interface';
import { WriteIntent } from 'src/core/ai-database/interface/write-intent.interface';
import { SchemaMetadataService } from 'src/core/ai-database/schema-metadata.service';
import { UserProfileService } from 'src/core/ai-database/user-profile.service';
import { BaseWriteHandler } from 'src/core/ai-database/write/base-write-handler';
import { EntityResolverService } from 'src/core/ai-database/write/entity-resolver.service';
import {
  WriteHandlerRegistry,
  WriteResult,
} from 'src/core/ai-database/write/write-handler.registry';
import {
  getExplicitTenantId,
  hasActiveTenant,
} from 'src/core/tenant/tenant.context';
import { AppSettingsDto } from './dto/app-settings.dto';
import { AppSettingsService } from './services/app-settings.service';

/**
 * Champs du cabinet modifiables depuis le chat : ceux de l'écran Paramètres
 * du cabinet, hors logo, apparence, SMTP, IA, gabarits et abonnement.
 */
export const CABINET_AI_FIELDS = [
  'name',
  'slogan',
  'contact_email',
  'contact_phone',
  'address',
  'website',
  'email_footer',
  'brand_color',
  'rccm',
  'nina',
  'bank_account',
  'app_locale',
  'date_format',
  'currency',
  'currency_symbol',
  'currency_symbol_position',
  'currency_decimals',
  'currency_thousands_sep',
  'currency_decimal_sep',
  'default_tva_rate',
  'invoice_prefix',
  'invoice_padding',
  'invoice_numbering_strategy',
  'invoice_number_format',
  'dossier_prefix',
  'dossier_number_format',
  'working_hours_start',
  'working_hours_end',
  'notification_email',
  'notification_sms',
  'dossier_opening_fee_enabled',
  'dossier_opening_fee',
  'dossier_opening_fee_tva',
  'dossier_opening_fee_label',
] as const;

const EDITABLE = new Set<string>(CABINET_AI_FIELDS);

/**
 * Modification des informations du cabinet par l'IA : toujours le cabinet
 * courant (jamais un identifiant reçu du plan), seulement les champs de
 * CABINET_AI_FIELDS, et par AppSettingsService.update comme l'écran.
 * Le droit manage_settings est vérifié en amont (AI_TABLE_PERMISSIONS).
 *
 * Fourni par AiDatabaseModule (qui importe déjà SettingsModule) : l'inverse
 * créerait une dépendance circulaire.
 */
@Injectable()
export class CabinetWriteHandler
  extends BaseWriteHandler
  implements OnModuleInit
{
  constructor(
    dataSource: DataSource,
    schemaMetadata: SchemaMetadataService,
    entityResolver: EntityResolverService,
    private readonly settings: AppSettingsService,
    private readonly registry: WriteHandlerRegistry,
    @Optional() private readonly profiles?: UserProfileService,
  ) {
    super(CABINET_TABLE, dataSource, schemaMetadata, entityResolver);
  }

  onModuleInit(): void {
    this.registry.register(this);
  }

  async getWriteableFieldsSchema(): Promise<WriteableFieldSchema[]> {
    const fields = await super.getWriteableFieldsSchema();
    return fields
      .filter((field) => EDITABLE.has(field.name))
      .map((field) => ({
        ...field,
        required: false,
        description: `${field.description ? `${field.description}. ` : ''}UPDATE uniquement, sans entityId ni match : le cabinet courant est toujours visé.`,
      }));
  }

  async execute(intent: WriteIntent, _userId: string): Promise<WriteResult> {
    if (intent.operation !== 'UPDATE') {
      throw new BadRequestException(
        "Le cabinet ne peut être que modifié depuis l'assistant.",
      );
    }
    const tenantId = hasActiveTenant() ? getExplicitTenantId() : undefined;
    if (!tenantId) {
      throw new ForbiddenException('Cabinet courant introuvable.');
    }
    if (
      intent.entityId !== undefined &&
      intent.entityId !== null &&
      String(intent.entityId) !== '' &&
      Number(intent.entityId) !== tenantId
    ) {
      throw new ForbiddenException(
        'Seules les informations de votre cabinet peuvent être modifiées.',
      );
    }

    const requested = this.filterKnownColumnsLenient(intent.fields ?? {});
    const refused = Object.keys(requested).filter((key) => !EDITABLE.has(key));
    const allowed = Object.fromEntries(
      Object.entries(requested).filter(([key]) => EDITABLE.has(key)),
    );
    const { fields, notes } = this.coerceFieldValues(allowed, 'UPDATE');
    if (!Object.keys(fields).length) {
      throw new BadRequestException(
        refused.length
          ? `Ces informations du cabinet ne se modifient pas depuis l'assistant : ${refused.join(', ')}. Utilisez Paramètres du cabinet.`
          : 'Aucune information du cabinet à modifier.',
      );
    }

    const saved = await this.settings.update(
      tenantId,
      fields as AppSettingsDto,
    );
    // Le contexte du chat (adresse, RCCM…) reflète tout de suite la modification.
    this.profiles?.invalidate();
    // Jamais de secret ni de binaire dans la réponse du chat.
    const data = Object.fromEntries(
      Object.entries(saved).filter(
        ([key]) => EDITABLE.has(key) || key === 'id',
      ),
    );
    const ignored = refused.length
      ? ` (non modifiable ici : ${refused.join(', ')})`
      : '';
    return {
      success: true,
      operation: 'UPDATE',
      entityId: tenantId,
      affected: 1,
      data,
      message:
        `Informations du cabinet mises à jour${ignored}` +
        (notes.length ? ` (${notes.join(' ; ')})` : ''),
    };
  }
}
