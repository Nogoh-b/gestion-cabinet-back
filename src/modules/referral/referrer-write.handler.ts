// src/modules/referral/referrer-write.handler.ts
import {
  BadRequestException,
  HttpException,
  Injectable,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  ValidationResult,
  WriteableFieldSchema,
} from 'src/core/ai-database/interface/entity-write-handler.interface';
import { SchemaMetadataService } from 'src/core/ai-database/schema-metadata.service';
import { BaseWriteHandler } from 'src/core/ai-database/write/base-write-handler';
import { EntityResolverService } from 'src/core/ai-database/write/entity-resolver.service';
import { WriteResult } from 'src/core/ai-database/write/write-handler.registry';
import { CreateReferrerDto } from './dto/create-referral.dto';
import { ReferrerPaymentMethod, ReferrerType } from './entities/referral.entity';
import { ReferrersService } from './referral.service';

const isFilled = (value: unknown) =>
  value !== undefined &&
  value !== null &&
  !(typeof value === 'string' && !value.trim());

const normalizeLabel = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

/** Libellés courants du type d'apporteur, comme dans le formulaire. */
const TYPE_PATTERNS: Array<[RegExp, ReferrerType]> = [
  [/compta|fiduciaire|accountant/, ReferrerType.ACCOUNTANT],
  [/confrere|avocat|lawyer|notaire|huissier/, ReferrerType.LAWYER],
  [/agence|agency/, ReferrerType.AGENCY],
  [/client|customer/, ReferrerType.CLIENT],
  [/employe|collaborateur|interne|employee/, ReferrerType.EMPLOYEE],
  [/particulier|individu|personne|individual/, ReferrerType.INDIVIDUAL],
];

export const toReferrerType = (value: unknown): ReferrerType => {
  const label = normalizeLabel(value);
  if ((Object.values(ReferrerType) as string[]).includes(label)) {
    return label as ReferrerType;
  }
  return (
    TYPE_PATTERNS.find(([pattern]) => pattern.test(label))?.[1] ??
    ReferrerType.OTHER
  );
};

const toPercent = (value: unknown): number | undefined => {
  if (!isFilled(value)) return undefined;
  const parsed = Number(String(value).replace('%', '').replace(',', '.').trim());
  return Number.isFinite(parsed) ? parsed : undefined;
};

const PAYMENT_PATTERNS: Array<[RegExp, ReferrerPaymentMethod]> = [
  [/virement/, ReferrerPaymentMethod.VIREMENT],
  [/cheque/, ReferrerPaymentMethod.CHEQUE],
  [/espece|cash/, ReferrerPaymentMethod.ESPECES],
  [/mobile|momo|orange money/, ReferrerPaymentMethod.MOBILE_MONEY],
];

/** Champs de `CreateReferrerDto` repris tels quels depuis le plan IA. */
const TEXT_DTO_FIELDS = [
  'contact_name',
  'email',
  'phone',
  'address',
  'bank_name',
  'bank_account_holder',
  'bank_iban',
  'notes',
] as const;

/**
 * Handler custom des apporteurs d'affaires.
 *
 * L'INSERT est délégué à `ReferrersService.create`, comme le formulaire : le
 * service génère `referrer_code` (REF-<cabinet>-<n°>), que le handler générique
 * exigeait du LLM. Le handler n'est jamais plus strict que la création
 * manuelle : un type inconnu devient « Autre » et un taux illisible est ignoré.
 */
@Injectable()
export class ReferrerWriteHandler extends BaseWriteHandler {
  constructor(
    dataSource: DataSource,
    schemaMetadata: SchemaMetadataService,
    entityResolver: EntityResolverService,
    private readonly referrersService: ReferrersService,
  ) {
    super('referrer', dataSource, schemaMetadata, entityResolver);
  }

  async getWriteableFieldsSchema(): Promise<WriteableFieldSchema[]> {
    const fields = (await super.getWriteableFieldsSchema()).filter(
      (field) => field.name !== 'referrer_code',
    );
    const enrichments: Record<string, Partial<WriteableFieldSchema>> = {
      company_name: {
        required: true,
        description: "Raison sociale ou nom complet de l'apporteur",
        example: 'Fiduciaire Sanaga Conseil',
      },
      referrer_type: {
        required: false,
        description:
          'lawyer=Confrère, accountant=Expert-comptable, agency=Agence, client, employee, individual=Particulier, other=Autre. Défaut : other.',
      },
      default_commission_rate: {
        description: 'Taux de commission par défaut, en % (0 à 100)',
        example: '10',
      },
    };
    for (const field of fields) {
      if (enrichments[field.name]) Object.assign(field, enrichments[field.name]);
    }
    return fields;
  }

  /**
   * Le libellé du chat devient la valeur de l'énumération avant la coercition
   * de `BaseWriteHandler`, qui écarterait « expert-comptable ».
   */
  async resolveDependencies(
    fields: Record<string, any>,
    ...rest: any[]
  ): Promise<Record<string, any>> {
    const { type, ...others } = fields;
    const label = others.referrer_type ?? type;
    const mapped = isFilled(label)
      ? { ...others, referrer_type: toReferrerType(label) }
      : others;
    return (super.resolveDependencies as any).call(this, mapped, ...rest);
  }

  async validateFields(
    fields: Record<string, any>,
    operation: 'INSERT' | 'UPDATE',
  ): Promise<ValidationResult> {
    const errors: string[] = [];
    const transformedFields = { ...fields };
    // Le code reste généré par le service, même si le LLM en propose un.
    delete transformedFields.referrer_code;

    if (operation === 'INSERT') {
      if (!isFilled(transformedFields.company_name)) {
        transformedFields.company_name =
          fields.name ?? fields.nom ?? fields.full_name;
      }
      delete transformedFields.name;
      delete transformedFields.nom;
      delete transformedFields.full_name;
      if (!isFilled(transformedFields.company_name)) {
        errors.push("Le nom de l'apporteur est obligatoire.");
      }
    }

    const rate = toPercent(
      fields.default_commission_rate ?? fields.commission_rate ?? fields.taux,
    );
    delete transformedFields.commission_rate;
    delete transformedFields.taux;
    if (rate !== undefined) {
      transformedFields.default_commission_rate = rate;
      if (rate < 0 || rate > 100) {
        errors.push('Le taux de commission doit être compris entre 0 et 100.');
      }
    }

    return { valid: errors.length === 0, errors, transformedFields };
  }

  protected async doInsert(
    fields: Record<string, any>,
    _userId: string,
  ): Promise<WriteResult> {
    const dto = this.buildCreateDto(fields);
    const existing = (await this.referrersService.findAll()).find(
      (referrer) =>
        normalizeLabel(referrer.company_name) ===
        normalizeLabel(dto.company_name),
    );
    if (existing) {
      return {
        success: true,
        operation: 'INSERT',
        entityId: existing.id,
        affected: 0,
        data: existing,
        message: `L'apporteur ${existing.company_name} existe déjà (${existing.referrer_code}) — aucun doublon n'a été créé`,
      };
    }

    try {
      const created = await this.referrersService.create(dto);
      return {
        success: true,
        operation: 'INSERT',
        entityId: created.id,
        affected: 1,
        data: created,
        message: `Apporteur ${created.company_name} créé avec succès (${created.referrer_code})`,
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new BadRequestException(this.translateDbError(error));
    }
  }

  private buildCreateDto(fields: Record<string, any>): CreateReferrerDto {
    const dto: Record<string, any> = {
      company_name: String(fields.company_name).trim(),
      referrer_type: toReferrerType(fields.referrer_type),
    };
    for (const key of TEXT_DTO_FIELDS) {
      if (isFilled(fields[key])) dto[key] = String(fields[key]).trim();
    }
    const rate = toPercent(fields.default_commission_rate);
    if (rate !== undefined) dto.default_commission_rate = rate;

    const paymentLabel = normalizeLabel(fields.payment_method);
    const payment = PAYMENT_PATTERNS.find(([pattern]) =>
      pattern.test(paymentLabel),
    )?.[1];
    if (payment) dto.payment_method = payment;

    return dto as CreateReferrerDto;
  }
}
