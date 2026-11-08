// src/modules/ai-skills/ouvrir-dossier.action.ts
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import {
  AiActionDefinition,
  AiActionHandler,
  PreparedAiAction,
} from 'src/core/ai-database/write/ai-action.registry';
import { Permission } from 'src/core/enums/permission.enum';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { Employee } from '../agencies/employee/entities/employee.entity';
import { BillingMode } from '../case-workflow/case-workflow.enums';
import { CaseBillingService } from '../case-workflow/services/case-billing.service';
import { Customer } from '../customer/customer/entities/customer.entity';
import { CreateDossierDto, InitialDossierBillingProfileDto } from '../dossiers/dto/create-dossier.dto';
import { DossiersService } from '../dossiers/dossiers.service';
import { User } from '../iam/user/entities/user.entity';
import { Jurisdiction } from '../jurisdiction/entities/jurisdiction.entity';
import { DossierReferralsService } from '../referral/dossier-referrals.service';
import { CommissionBasis, CommissionMode } from '../referral/entities/dossier-referral.entity';
import { ReferrerType } from '../referral/entities/referral.entity';
import { ReferrersService } from '../referral/referral.service';

const normalize = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** « 1 500 000 », « 19,25 % » → nombre (undefined si illisible). */
export function parseAmount(value: unknown): number | undefined {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  const parsed = Number(String(value).replace(/[\s  ]/g, '').replace('%', '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function toBillingMode(value: unknown, hasFixed: boolean, hasHourly: boolean, hasPercentage: boolean): BillingMode {
  const label = normalize(value);
  if ((Object.values(BillingMode) as string[]).includes(label.toUpperCase())) return label.toUpperCase() as BillingMode;
  const fixed = hasFixed || /forfait/.test(label);
  const hourly = hasHourly || /horaire|temps passe/.test(label);
  const percentage = hasPercentage || /pourcentage|proportionnel/.test(label);
  if ([fixed, hourly, percentage].filter(Boolean).length > 1 || /mixte/.test(label)) return BillingMode.MIXED;
  if (hourly) return BillingMode.HOURLY;
  if (percentage) return BillingMode.PERCENTAGE;
  return BillingMode.FIXED;
}

export function toCommissionBasis(value: unknown): CommissionBasis | undefined {
  const label = normalize(value).replace(/_/g, ' ');
  if (!label) return undefined;
  const ttc = /ttc/.test(label);
  if (/factur|invoiced/.test(label)) return ttc ? CommissionBasis.INVOICED_TTC : CommissionBasis.INVOICED_HT;
  if (/encaiss|collected/.test(label)) return ttc ? CommissionBasis.COLLECTED_TTC : CommissionBasis.COLLECTED_HT;
  return undefined;
}

/** Nom exact d'abord, sinon inclusion, à condition de désigner une seule fiche. */
export function pickByName<T>(items: T[], name: unknown, nameOf: (item: T) => string): T | undefined {
  const wanted = normalize(name);
  if (!wanted) return undefined;
  const exact = items.filter((item) => normalize(nameOf(item)) === wanted);
  if (exact.length === 1) return exact[0];
  const near = items.filter((item) => {
    const current = normalize(nameOf(item));
    return current && (current.includes(wanted) || wanted.includes(current));
  });
  return near.length === 1 ? near[0] : undefined;
}

const BILLING_MODE_OPTIONS = [
  { value: BillingMode.FIXED, label: 'Forfait' },
  { value: BillingMode.HOURLY, label: 'Horaire' },
  { value: BillingMode.PERCENTAGE, label: 'Pourcentage' },
  { value: BillingMode.MIXED, label: 'Forfait + horaire (mixte)' },
];

const COMMISSION_BASIS_OPTIONS = [
  { value: CommissionBasis.INVOICED_HT, label: 'Facturé HT' },
  { value: CommissionBasis.INVOICED_TTC, label: 'Facturé TTC' },
  { value: CommissionBasis.COLLECTED_HT, label: 'Encaissé HT' },
  { value: CommissionBasis.COLLECTED_TTC, label: 'Encaissé TTC' },
];

/**
 * Ouverture d'un dossier depuis le chat. `dossiers` suit un cycle de vie
 * métier : l'IA passe ici, par le service du formulaire d'ouverture (numéro,
 * parcours, profil de facturation créé une seule fois), puis lie l'apporteur
 * comme le fait ce formulaire. L'action s'exécute après validation du plan :
 * facturation et apporteur sont donc ses paramètres, pas des opérations.
 */
@Injectable()
export class OuvrirDossierAiAction implements AiActionHandler {
  readonly definition: AiActionDefinition = {
    name: 'ouvrir_dossier',
    entity: 'customer',
    label: 'Ouverture du dossier',
    description:
      "Ouvre un dossier pour le client visé, avec sa facturation et son apporteur. C'est la SEULE façon de créer un dossier ; ne fais jamais d'INSERT sur dossiers, dossier_billing_profiles ou dossier_referral. Si le client n'existe pas, prévois d'abord un INSERT customer avec un tempId et mets \"entityId\": \"{{tempId.id}}\".",
    permission: Permission.CREATE_DOSSIER,
    params: [
      { name: 'object', label: 'Objet du dossier', required: true },
      { name: 'opposing_party_name', label: 'Partie adverse' },
      { name: 'lawyer', label: 'Avocat responsable', description: 'Nom complet du collaborateur.' },
      { name: 'collaborators', label: 'Collaborateurs', description: 'Noms séparés par des virgules.' },
      { name: 'jurisdiction', label: 'Juridiction', description: 'Nom de la juridiction.' },
      { name: 'description', label: 'Description', kind: 'longtext' },
      { name: 'billing_mode', label: 'Mode de facturation', kind: 'enum', description: 'FIXED, HOURLY, PERCENTAGE ou MIXED (forfait + horaire).' },
      { name: 'fixed_fee', label: 'Forfait (HT)' },
      { name: 'hourly_rate', label: 'Tarif horaire (HT)' },
      { name: 'default_vacation_rate', label: 'Vacation (HT)' },
      { name: 'percentage_rate', label: 'Pourcentage (%)' },
      { name: 'vat_rate', label: 'TVA (%)' },
      { name: 'result_fee_rate', label: 'Honoraire de résultat (%)' },
      { name: 'opening_fee', label: "Frais d'ouverture" },
      { name: 'referrer', label: 'Apporteur', description: "Nom de l'apporteur ; créé s'il n'existe pas." },
      { name: 'commission_rate', label: 'Commission apporteur (%)' },
      { name: 'commission_basis', label: 'Base de commission', kind: 'enum', description: 'invoiced_ht (Facturé HT), invoiced_ttc, collected_ht (Encaissé HT), collected_ttc.' },
    ],
    examples: [
      'Crée un dossier de recouvrement pour la SARL Bois du Littoral contre Kribi Logistique SA',
      'Ouvre ce dossier : forfait 1 500 000, tarif horaire 40 000, apporteur Fiduciaire Sanaga Conseil 10 % sur le facturé HT',
    ],
  };

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly dossiers: DossiersService,
    private readonly billing: CaseBillingService,
    private readonly referrers: ReferrersService,
    private readonly referrals: DossierReferralsService,
  ) {}

  async paramOptions() {
    return { billing_mode: BILLING_MODE_OPTIONS, commission_basis: COMMISSION_BASIS_OPTIONS };
  }

  private async loadClient(targetId: string | number): Promise<Customer> {
    const client = await this.dataSource.getRepository(Customer).findOne({
      where: { id: Number(targetId), tenant_id: getCurrentTenantId() } as any,
    });
    if (!client) throw new NotFoundException('Client introuvable.');
    return client;
  }

  private buildBillingProfile(params: Record<string, any>): InitialDossierBillingProfileDto | undefined {
    const fixedFee = parseAmount(params.fixed_fee);
    const hourlyRate = parseAmount(params.hourly_rate);
    const percentageRate = parseAmount(params.percentage_rate);
    const vacationRate = parseAmount(params.default_vacation_rate);
    const vatRate = parseAmount(params.vat_rate);
    const resultRate = parseAmount(params.result_fee_rate);
    const openingFee = parseAmount(params.opening_fee);
    const values = [fixedFee, hourlyRate, percentageRate, vacationRate, vatRate, resultRate, openingFee];
    if (!params.billing_mode && values.every((value) => value === undefined)) return undefined;

    const profile: InitialDossierBillingProfileDto = {
      mode: toBillingMode(params.billing_mode, fixedFee !== undefined, hourlyRate !== undefined, percentageRate !== undefined),
    };
    if (fixedFee !== undefined) profile.fixed_fee = fixedFee;
    if (hourlyRate !== undefined) profile.hourly_rate = hourlyRate;
    if (vacationRate !== undefined) profile.default_vacation_rate = vacationRate;
    if (vatRate !== undefined) profile.vat_rate = vatRate;
    if (openingFee !== undefined) profile.opening_fee = openingFee;
    if (resultRate !== undefined) {
      profile.result_fee_enabled = true;
      profile.result_fee_rate = resultRate;
    }
    return profile;
  }

  private async resolveTeam(params: Record<string, any>) {
    const tenantId = getCurrentTenantId();
    const employees = await this.dataSource.getRepository(Employee).find({
      where: { tenant_id: tenantId } as any,
      relations: ['user'],
    });
    const nameOf = (employee: Employee) => employee.user?.full_name ?? '';
    const notes: string[] = [];
    const lawyer = pickByName(employees, params.lawyer, nameOf);
    if (params.lawyer && !lawyer) notes.push(`avocat « ${params.lawyer} » à choisir sur le dossier`);

    const collaboratorIds: number[] = [];
    const names = String(params.collaborators ?? '').split(/[,;]| et /).map((name) => name.trim()).filter(Boolean);
    for (const name of names) {
      const collaborator = pickByName(employees, name, nameOf);
      if (collaborator) collaboratorIds.push(collaborator.id);
      else notes.push(`collaborateur « ${name} » à ajouter sur le dossier`);
    }
    return { lawyerId: lawyer?.id, collaboratorIds, notes };
  }

  private async resolveJurisdiction(name: unknown): Promise<number | undefined> {
    if (!String(name ?? '').trim()) return undefined;
    const tenantId = getCurrentTenantId();
    const all = await this.dataSource.getRepository(Jurisdiction).find();
    const visible = all.filter((item) => item.tenant_id == null || item.tenant_id === tenantId);
    return pickByName(visible, name, (item) => item.name)?.id;
  }

  async preview(targetId: string | number, params: Record<string, any>): Promise<string> {
    const client = await this.loadClient(targetId);
    const label = client.company_name || client.full_name;
    return [`Client : ${label}`, params.referrer ? `Apporteur : ${params.referrer}` : ''].filter(Boolean).join(' · ');
  }

  async prepare(targetId: string | number, params: Record<string, any>, userId: string): Promise<PreparedAiAction> {
    const client = await this.loadClient(targetId);
    const actor = await this.dataSource.getRepository(User).findOne({ where: { id: Number(userId) } as any });
    if (!actor) throw new BadRequestException('Utilisateur introuvable.');

    const clientLabel = client.company_name || client.full_name;
    return {
      data: client as unknown as Record<string, any>,
      plannedMessage: `Dossier « ${params.object} » à ouvrir pour ${clientLabel}.`,
      run: async () => {
        const { lawyerId, collaboratorIds, notes } = await this.resolveTeam(params);
        const jurisdictionId = await this.resolveJurisdiction(params.jurisdiction);
        const dto = {
          client_id: client.id,
          object: String(params.object).trim(),
          collaborator_ids: collaboratorIds,
          ...(lawyerId ? { lawyer_id: lawyerId } : {}),
          ...(params.opposing_party_name ? { opposing_party_name: String(params.opposing_party_name).trim() } : {}),
          ...(params.description ? { description: String(params.description).trim() } : {}),
          // Juridiction hors référentiel : gardée en clair, comme la saisie libre du formulaire.
          ...(jurisdictionId
            ? { jurisdiction_id: jurisdictionId }
            : params.jurisdiction
              ? { court_name: String(params.jurisdiction).trim() }
              : {}),
          billing_profile: this.buildBillingProfile(params),
        } as unknown as CreateDossierDto;

        const dossier = await this.dossiers.create(dto, actor);

        const percentageRate = parseAmount(params.percentage_rate);
        if (percentageRate !== undefined) {
          await this.billing.updateProfile(dossier.id, { percentage_rate: percentageRate } as any, actor.id);
        }
        if (params.referrer) {
          notes.push(await this.linkReferrer(dossier.id, params));
        }
        return [`Dossier ${dossier.dossier_number} ouvert pour ${clientLabel}`, ...notes].join(' ; ');
      },
    };
  }

  /** Étape séparée, comme le formulaire d'ouverture : son échec ne retire pas le dossier. */
  private async linkReferrer(dossierId: number, params: Record<string, any>): Promise<string> {
    const rate = parseAmount(params.commission_rate);
    try {
      const existing = pickByName(await this.referrers.findAll(), params.referrer, (item) => item.company_name);
      const referrer =
        existing ??
        (await this.referrers.create({
          company_name: String(params.referrer).trim(),
          referrer_type: ReferrerType.OTHER,
          ...(rate !== undefined ? { default_commission_rate: rate } : {}),
        } as any));
      const basis = toCommissionBasis(params.commission_basis);
      await this.referrals.create({
        dossier_id: dossierId,
        referrer_id: referrer.id,
        commission_mode: CommissionMode.RATE,
        ...(rate !== undefined ? { commission_rate: rate } : {}),
        ...(basis ? { commission_basis: basis } : {}),
      } as any);
      return `apporteur ${referrer.company_name} lié au dossier`;
    } catch (error) {
      return `apporteur non lié : ${(error as Error).message}`;
    }
  }
}
