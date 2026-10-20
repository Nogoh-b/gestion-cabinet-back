// src/modules/ai-skills/skill-targets.service.ts
import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';

import type { SkillTarget } from 'src/core/ai-database/skills/skill-helpers';
import type { AiSkillTargetType } from 'src/core/ai-database/skills/ai-skill.types';
import { Audience } from '../audiences/entities/audience.entity';
import { Customer } from '../customer/customer/entities/customer.entity';
import { Diligence } from '../diligence/entities/diligence.entity';
import { DocumentCustomer } from '../documents/document-customer/entities/document-customer.entity';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { Employee } from '../agencies/employee/entities/employee.entity';
import { Facture } from '../facture/entities/facture.entity';
import { normalizeAccessText } from 'src/core/ai-database/ai-access-policy';
import { Cabinet } from '../cabinet/entities/cabinet.entity';
import { DossierAction } from '../case-workflow/entities/dossier-action.entity';
import { AiDatabasePermissionService } from 'src/core/ai-database/ai-database-permission.service';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { htmlToText } from 'src/core/ai-database/skills/skill-helpers';

/** Type de mention → `linkedEntity.type` de l'historique des e-mails. */
const MAIL_ENTITY_TYPES: Record<AiSkillTargetType, string> = {
  client: 'client',
  dossier: 'dossier',
  audience: 'audience',
  facture: 'facture',
  employee: 'employee',
  diligence: 'diligence',
  document: 'document',
};

const ACTION_STATUS_LABELS: Record<string, string> = {
  TODO: 'à faire',
  IN_PROGRESS: 'en cours',
  ON_HOLD: 'en attente',
  COMPLETED: 'terminée',
  CANCELLED: 'annulée',
};

const AUDIENCE_STATUS_LABELS: Record<number, string> = {
  0: 'programmée',
  1: 'tenue',
  2: 'renvoyée',
  3: 'annulée',
};

const DILIGENCE_STATUS_LABELS: Record<string, string> = {
  draft: 'à faire',
  in_progress: 'en cours',
  review: 'en relecture',
  completed: 'terminée',
  cancelled: 'annulée',
};

/** La demande porte sur la facturation (impayés, relance, solde…). */
const BILLING_TOPIC = /\b(factur\w*|impaye\w*|paiements?|payer|paye|regl\w*|honoraires?|solde\w*|reste a payer|creances?|dettes?|sommes? dues?|arrieres?|recouvrement|relance\w*)\b/;
/** La demande porte sur l'avancement du dossier (récapitulatif, point, actions menées). */
const ACTIVITY_TOPIC = /\b(recap\w*|recapitulatif|actions?|avancement|point|ou en est|suivi|etat du dossier|historique|chronolog\w*|compte rendu|diligences?|audiences?|demarches?|fait jusqu)\b/;

export function requestTopics(question = ''): { billing: boolean; activity: boolean } {
  const normalized = normalizeAccessText(question);
  return { billing: BILLING_TOPIC.test(normalized), activity: ACTIVITY_TOPIC.test(normalized) };
}

export interface UnpaidInvoice {
  facture: Facture;
  paid: number;
  reste: number;
  due: Date | null;
  lateDays: number;
}

/**
 * Factures non soldées (montant TTC moins paiements validés), du cabinet ou
 * d'un client / dossier ; brouillons, factures payées et annulées exclues.
 */
export async function unpaidInvoices(
  dataSource: DataSource,
  scope: { clientId?: number | string; dossierId?: number | string } = {},
  today = new Date(),
): Promise<UnpaidInvoice[]> {
  const qb = dataSource.getRepository(Facture)
    .createQueryBuilder('f')
    .leftJoinAndSelect('f.client', 'c')
    .leftJoinAndSelect('f.dossier', 'd')
    // Colonnes ENUM numériques : codes BD en chaînes (brouillon, payée, annulée exclues).
    .leftJoinAndSelect('f.paiements', 'p', "p.status = '1'")
    .where("f.status NOT IN ('0', '3', '5')")
    .orderBy('f.dateEcheance', 'ASC');
  if (scope.clientId) qb.andWhere('f.client_id = :client', { client: scope.clientId });
  if (scope.dossierId) qb.andWhere('f.dossier_id = :dossier', { dossier: scope.dossierId });
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  return (await qb.getMany())
    .map((facture: any) => {
      const paid = (facture.paiements ?? []).reduce((sum: number, p: any) => sum + Number(p?.montant ?? 0), 0);
      const reste = Number(facture.montantTTC ?? 0) - paid;
      const due = facture.dateEcheance ? new Date(facture.dateEcheance) : null;
      const lateDays = due && due < start ? Math.floor((start.getTime() - due.getTime()) / 86_400_000) : 0;
      return { facture, paid, reste, due, lateDays };
    })
    .filter((row) => row.reste > 0.009);
}

/** Enregistrement visé par une compétence, avec ce qu'il faut pour écrire. */
export interface TargetInfo {
  type: AiSkillTargetType;
  table: string;
  id: number | string;
  /** Libellé lisible (« Dossier DOS-2026-0001 », « Facture FAC-… »). */
  label: string;
  resource: any;
  dossier: Dossier | null;
  client: Customer | null;
  employee: Employee | null;
  /** Destinataire naturel : le client, ou le collaborateur visé. */
  recipientName: string;
  email: string | null;
  phone: string | null;
  /** Rattachement de l'historique des e-mails (linkedEntity / parentRef). */
  mailEntity: { type: string; id: number | string };
  mailParent: { type: string; id: number } | null;
}

export function customerName(client: Partial<Customer> | null | undefined): string {
  if (!client) return '';
  return (
    client.company_name ||
    client.full_name ||
    [client.first_name, client.last_name].filter(Boolean).join(' ') ||
    `Client #${client.id}`
  ).trim();
}

export function customerPhone(client: Partial<Customer> | null | undefined): string | null {
  return client?.number_phone_1 || client?.number_phone_2 || client?.professional_phone || null;
}

export function employeeName(employee: Employee | null | undefined): string {
  const user: any = employee?.user;
  return (user?.full_name || [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.username || `Collaborateur #${employee?.id ?? ''}`).trim();
}

const dateFr = (value: unknown): string => {
  if (!value) return '';
  const date = new Date(value as any);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleDateString('fr-FR');
};

const money = (value: unknown): string =>
  `${Number(value ?? 0).toLocaleString('fr-FR', { maximumFractionDigits: 0 })} FCFA`;

/**
 * Charge la cible d'une compétence dans le cabinet courant (les dépôts sont
 * filtrés par cabinet et par confidentialité des dossiers).
 */
@Injectable()
export class SkillTargetsService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Optional() private readonly permissions?: AiDatabasePermissionService,
  ) {}

  async load(target: SkillTarget): Promise<TargetInfo> {
    const repo = <T extends object>(entity: new () => T) => this.dataSource.getRepository<T>(entity);
    let resource: any;
    let dossier: Dossier | null = null;
    let client: Customer | null = null;
    let employee: Employee | null = null;
    let label = target.label;

    switch (target.type) {
      case 'client':
        client = resource = await repo(Customer).findOne({ where: { id: target.id } as any });
        label = customerName(client);
        break;
      case 'dossier':
        dossier = resource = await repo(Dossier).findOne({
          where: { id: target.id } as any,
          relations: ['client', 'jurisdiction', 'lawyer', 'lawyer.user'],
        });
        client = dossier?.client ?? null;
        label = dossier ? `Dossier ${dossier.dossier_number}` : label;
        break;
      case 'audience': {
        resource = await repo(Audience).findOne({
          where: { id: target.id } as any,
          relations: ['dossier', 'dossier.client', 'jurisdiction'],
        });
        dossier = resource?.dossier ?? null;
        client = dossier?.client ?? null;
        label = resource ? `Audience du ${dateFr(resource.audience_date)}${dossier ? ` · ${dossier.dossier_number}` : ''}` : label;
        break;
      }
      case 'facture':
        resource = await repo(Facture).findOne({
          where: { id: target.id } as any,
          relations: ['client', 'dossier', 'dossier.client'],
        });
        dossier = resource?.dossier ?? null;
        client = resource?.client ?? dossier?.client ?? null;
        label = resource ? `Facture ${resource.numero}` : label;
        break;
      case 'diligence':
        resource = await repo(Diligence).findOne({
          where: { id: target.id } as any,
          relations: ['dossier', 'dossier.client'],
        });
        dossier = resource?.dossier ?? null;
        client = dossier?.client ?? null;
        label = resource ? `Diligence « ${resource.title} »` : label;
        break;
      case 'employee':
        employee = resource = await repo(Employee).findOne({ where: { id: target.id } as any, relations: ['user'] });
        label = employee ? employeeName(employee) : label;
        break;
      case 'document':
        resource = await repo(DocumentCustomer).findOne({
          where: { id: target.id } as any,
          relations: ['dossier', 'dossier.client', 'customer'],
        });
        dossier = resource?.dossier ?? null;
        client = resource?.customer ?? dossier?.client ?? null;
        label = resource ? `Document « ${resource.name ?? resource.original_name} »` : label;
        break;
    }
    if (!resource) {
      throw new NotFoundException(`${target.label || 'Élément'} introuvable dans ce cabinet (ou non accessible avec vos droits).`);
    }

    const user: any = employee?.user;
    return {
      type: target.type,
      table: target.table,
      id: target.id,
      label,
      resource,
      dossier,
      client,
      employee,
      recipientName: employee ? employeeName(employee) : customerName(client),
      email: (employee ? user?.email : client?.email) || null,
      phone: employee ? (employee.professional_phone || employee.personal_phone || null) : customerPhone(client),
      mailEntity: { type: MAIL_ENTITY_TYPES[target.type], id: target.id },
      mailParent: dossier && target.type !== 'dossier' ? { type: 'dossier', id: dossier.id } : null,
    };
  }

  /**
   * Faits utiles à la rédaction (aucun montant inventé : seulement ceux
   * enregistrés). Pour un dossier (ou un client), l'activité menée : actions,
   * audiences passées, diligences et pièces, selon les droits de `user`.
   */
  async facts(info: TargetInfo, user?: any, question?: string): Promise<string> {
    const topics = requestTopics(question);
    const lines: string[] = [];
    const { client, dossier, resource } = info;
    if (client) {
      lines.push(`Client : ${customerName(client)}${client.address ? ` — adresse : ${client.address}` : ''}`);
    }
    if (client && !dossier) lines.push(...(await this.clientDossierFacts(client.id, user, !topics.billing || topics.activity)));
    if (dossier) {
      const object = htmlToText(dossier.object ?? '');
      lines.push(`Dossier : ${dossier.dossier_number}${object ? ` — objet : ${object}` : ''}`);
      if (dossier.status !== undefined && dossier.status !== null) lines.push(`Statut du dossier : ${dossier.status}`);
      if (dossier.court_name || (dossier as any).jurisdiction?.name) lines.push(`Juridiction : ${(dossier as any).jurisdiction?.name ?? dossier.court_name}`);
      if (dossier.opposing_party_name) lines.push(`Partie adverse : ${dossier.opposing_party_name}${dossier.opposing_party_contact ? ` (${dossier.opposing_party_contact})` : ''}`);
      if ((dossier as any).lawyer) lines.push(`Avocat en charge : ${employeeName((dossier as any).lawyer)}`);
      const next = await this.dataSource.getRepository(Audience)
        .createQueryBuilder('a')
        .leftJoinAndSelect('a.jurisdiction', 'j')
        .where('a.dossier_id = :id', { id: dossier.id })
        .andWhere('a.audience_date >= CURDATE()')
        .orderBy('a.audience_date', 'ASC')
        .getOne()
        .catch(() => null);
      if (next && info.type !== 'audience') {
        lines.push(`Prochaine audience : ${dateFr(next.audience_date)}${next.audience_time ? ` à ${String(next.audience_time).slice(0, 5)}` : ''}${(next as any).jurisdiction?.name ? ` — ${(next as any).jurisdiction.name}` : ''}${next.room ? `, salle ${next.room}` : ''}`);
      }
      // Une demande sur les factures ne reçoit l'activité que si elle la demande aussi.
      if (info.type === 'dossier' && (!topics.billing || topics.activity)) {
        const activity = await this.activity(dossier.id, user);
        if (activity.length) lines.push(`Activité du dossier (actions menées, du plus ancien au plus récent) :\n${activity.join('\n')}`);
        else lines.push("Activité du dossier : aucune action, audience passée, diligence ni pièce enregistrée.");
      }
    }
    if (topics.billing && info.type !== 'facture') lines.push(...(await this.billingFacts(info, user)));
    if (info.type === 'audience') {
      lines.push(`Audience : ${dateFr(resource.audience_date)}${resource.audience_time ? ` à ${String(resource.audience_time).slice(0, 5)}` : ''}${resource.jurisdiction?.name ? ` — ${resource.jurisdiction.name}` : ''}${resource.room ? `, salle ${resource.room}` : ''}`);
      if (resource.judge_name) lines.push(`Juge : ${resource.judge_name}`);
      if (resource.decision) lines.push(`Décision : ${resource.decision}`);
      if (resource.outcome) lines.push(`Issue : ${resource.outcome}`);
      if (resource.postponed_to) lines.push(`Renvoyée au : ${dateFr(resource.postponed_to)}`);
      if (resource.notes) lines.push(`Notes : ${String(resource.notes).slice(0, 1500)}`);
    }
    if (info.type === 'facture') {
      lines.push(`Facture : ${resource.numero} du ${dateFr(resource.dateFacture)} — montant TTC ${money(resource.montantTTC)}${resource.dateEcheance ? ` — échéance ${dateFr(resource.dateEcheance)}` : ''}`);
    }
    if (info.type === 'diligence') {
      lines.push(`Diligence : ${resource.title}${resource.deadline ? ` — échéance ${dateFr(resource.deadline)}` : ''}`);
      if (resource.description) lines.push(`Description : ${String(resource.description).slice(0, 800)}`);
    }
    if (info.type === 'employee') {
      lines.push(`Collaborateur : ${employeeName(info.employee)}${(info.employee as any)?.position ? ` (${(info.employee as any).position})` : ''}`);
    }
    return lines.join('\n');
  }

  /**
   * Dossiers récents d'un client et sa prochaine audience. `find` applique la
   * confidentialité des dossiers ; les audiences ne portent que sur ceux-là.
   */
  private async clientDossierFacts(clientId: number, user?: any, withActivity = true): Promise<string[]> {
    const dossiers = await this.dataSource.getRepository(Dossier)
      .find({ where: { client_id: clientId } as any, order: { id: 'DESC' } as any, take: 5 })
      .catch(() => [] as Dossier[]);
    if (!dossiers.length) return [];
    const lines = [`Dossiers du client : ${dossiers.map((d) => {
      const object = htmlToText(d.object ?? '');
      return `${d.dossier_number}${object ? ` (${object.slice(0, 80)})` : ''}`;
    }).join(' ; ')}`];
    const next = await this.dataSource.getRepository(Audience)
      .createQueryBuilder('a')
      .leftJoinAndSelect('a.jurisdiction', 'j')
      .where('a.dossier_id IN (:...ids)', { ids: dossiers.map((d) => d.id) })
      .andWhere('a.audience_date >= CURDATE()')
      .orderBy('a.audience_date', 'ASC')
      .getOne()
      .catch(() => null);
    if (next) {
      const number = dossiers.find((d) => String(d.id) === String(next.dossier_id))?.dossier_number;
      lines.push(`Prochaine audience : ${dateFr(next.audience_date)}${next.audience_time ? ` à ${String(next.audience_time).slice(0, 5)}` : ''}${(next as any).jurisdiction?.name ? ` — ${(next as any).jurisdiction.name}` : ''}${next.room ? `, salle ${next.room}` : ''}${number ? ` (dossier ${number})` : ''}`);
    }
    // Activité du dossier le plus récent, en version courte.
    const activity = withActivity ? await this.activity(dossiers[0].id, user, 10) : [];
    if (activity.length) {
      lines.push(`Activité récente du dossier ${dossiers[0].dossier_number} :\n${activity.join('\n')}`);
    }
    return lines;
  }

  /**
   * Factures non soldées du dossier (sinon du client) : numéro, dates, montant,
   * déjà payé, reste dû et retard. Seulement avec le droit de voir les factures.
   */
  async billingFacts(info: TargetInfo, user?: any): Promise<string[]> {
    if (this.permissions && user && (await this.permissions.missingPermissions(user, ['view_factures']).catch(() => ['view_factures'])).length) {
      return ["Factures : non consultables avec les droits de l'utilisateur (n'en parle pas)."];
    }
    const scope = info.dossier ? { dossierId: info.dossier.id } : info.client ? { clientId: info.client.id } : null;
    if (!scope) return [];
    const where = info.dossier ? `du dossier ${info.dossier.dossier_number}` : `de ${customerName(info.client)}`;
    const rows = await unpaidInvoices(this.dataSource, scope).catch(() => [] as UnpaidInvoice[]);
    if (!rows.length) return [`Factures ${where} : aucune facture non soldée.`];
    const total = rows.reduce((sum, row) => sum + row.reste, 0);
    const late = rows.filter((row) => row.lateDays > 0);
    return [
      `Factures non soldées ${where} : ${rows.length} facture(s), ${money(total)} restant dû${late.length ? `, dont ${late.length} en retard` : ''} :`,
      ...rows.slice(0, 10).map(({ facture, paid, reste, due, lateDays }) =>
        `- Facture ${facture.numero} du ${dateFr(facture.dateFacture)}${facture.libelle ? ` (${htmlToText(facture.libelle).slice(0, 80)})` : ''} — montant TTC ${money(facture.montantTTC)}${paid > 0 ? `, déjà payé ${money(paid)}` : ''}, reste dû ${money(reste)}${due ? ` — échéance ${dateFr(due)}${lateDays ? ` (en retard de ${lateDays} jour${lateDays > 1 ? 's' : ''})` : ''}` : ''}`),
      ...(rows.length > 10 ? [`… et ${rows.length - 10} autre(s) facture(s).`] : []),
    ];
  }

  /**
   * Chronologie de ce qui a été fait sur un dossier : actions du dossier,
   * audiences passées (décision, renvoi, compte rendu), diligences et pièces
   * récentes non confidentielles. Chaque source n'est lue qu'avec le droit
   * de lecture correspondant ; les `limit` éléments les plus récents.
   */
  async activity(dossierId: number, user?: any, limit = 25): Promise<string[]> {
    const can = async (code: string) =>
      !this.permissions || !user || (await this.permissions.missingPermissions(user, [code]).catch(() => [code])).length === 0;
    const items: Array<{ at: number; text: string }> = [];
    const push = (date: unknown, text: string) => {
      const at = date ? new Date(date as any).getTime() : NaN;
      items.push({ at: Number.isFinite(at) ? at : 0, text: `${Number.isFinite(at) && at ? dateFr(date) : 'date non renseignée'} — ${text}` });
    };
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const overdue = (value: unknown) => {
      const date = new Date(value as any);
      return !Number.isNaN(date.getTime()) && date < startOfToday;
    };
    const clip = (value: unknown, max: number) => {
      const text = htmlToText(String(value ?? '')).replace(/\s+/g, ' ').trim();
      return text.length > max ? `${text.slice(0, max - 1)}…` : text;
    };

    if (await can('view_dossier_actions')) {
      const actions = await this.dataSource.getRepository(DossierAction)
        .find({ where: { dossier_id: dossierId } as any, order: { created_at: 'DESC' } as any, take: 40 })
        .catch(() => [] as DossierAction[]);
      for (const action of actions) {
        const status = ACTION_STATUS_LABELS[String(action.status)] ?? String(action.status ?? '').toLowerCase();
        const date = action.completed_at ?? action.started_at ?? action.cancelled_at ?? action.due_at ?? action.planned_at ?? (action as any).created_at;
        const result = action.result_notes ? ` — résultat : ${clip(action.result_notes, 220)}` : action.result_code ? ` — résultat : ${action.result_code}` : '';
        const due = !action.completed_at && !action.cancelled_at && action.due_at ? ` (${overdue(action.due_at) ? 'échéance dépassée depuis le' : 'échéance'} ${dateFr(action.due_at)})` : '';
        push(date, `Action « ${clip(action.title || action.definition_label, 120)} » : ${status}${due}${result}`);
      }
    }

    if (await can('view_audiences')) {
      const audiences = await this.dataSource.getRepository(Audience)
        .createQueryBuilder('a')
        .leftJoinAndSelect('a.jurisdiction', 'j')
        .where('a.dossier_id = :id', { id: dossierId })
        .andWhere('a.audience_date < CURDATE()')
        .orderBy('a.audience_date', 'DESC')
        .take(15)
        .getMany()
        .catch(() => [] as Audience[]);
      for (const audience of audiences) {
        const status = AUDIENCE_STATUS_LABELS[Number(audience.status)] ?? '';
        const decision = clip(audience.decision_text || audience.decision || audience.decision_outcome || audience.outcome, 220);
        const report = clip(audience.report_content || audience.notes, 260);
        push(audience.audience_date, [
          `Audience${(audience as any).jurisdiction?.name ? ` (${(audience as any).jurisdiction.name})` : ''}${status ? ` : ${status}` : ''}`,
          decision && `décision : ${decision}`,
          audience.postponed_to && `renvoyée au ${dateFr(audience.postponed_to)}`,
          report && `compte rendu : ${report}`,
        ].filter(Boolean).join(' — '));
      }
    }

    if (await can('view_diligences')) {
      const diligences = await this.dataSource.getRepository(Diligence)
        .find({ where: { dossier_id: dossierId } as any, order: { id: 'DESC' } as any, take: 20 })
        .catch(() => [] as Diligence[]);
      for (const diligence of diligences) {
        if (diligence.confidential) continue;
        const status = DILIGENCE_STATUS_LABELS[String(diligence.status)] ?? String(diligence.status ?? '');
        const findings = clip(diligence.findings_summary, 200);
        push(
          diligence.completion_date ?? diligence.start_date ?? diligence.deadline ?? (diligence as any).created_at,
          `Diligence « ${clip(diligence.title, 120)} » : ${status}${!diligence.completion_date && diligence.deadline ? ` (${overdue(diligence.deadline) ? 'échéance dépassée depuis le' : 'échéance'} ${dateFr(diligence.deadline)})` : ''}${findings ? ` — conclusions : ${findings}` : ''}`,
        );
      }
    }

    if (await can('view_documents')) {
      const documents = await this.dataSource.getRepository(DocumentCustomer)
        .find({ where: { dossier_id: dossierId } as any, order: { id: 'DESC' } as any, take: 12 })
        .catch(() => [] as DocumentCustomer[]);
      for (const document of documents) {
        if ((document as any).is_confidential) continue;
        push((document as any).created_at, `Pièce ajoutée : « ${clip((document as any).name ?? (document as any).original_name, 120)} »`);
      }
    }

    return items
      .sort((a, b) => b.at - a.at)
      .slice(0, limit)
      .reverse()
      .map((item) => `- ${item.text}`);
  }

  /** Signataire des rédactions : l'utilisateur, sa fonction et son cabinet. */
  async sender(userId: string | number): Promise<{ name: string; title: string; cabinetName: string; cabinetAddress: string }> {
    const employee = await this.dataSource.getRepository(Employee)
      .findOne({ where: { id: Number(userId) } as any, relations: ['user'] })
      .catch(() => null);
    const cabinet = await this.dataSource.getRepository(Cabinet)
      .findOne({ where: { id: getCurrentTenantId() } as any })
      .catch(() => null);
    const position = String((employee as any)?.position ?? '');
    return {
      name: employee ? employeeName(employee) : '',
      title: position ? position.charAt(0).toUpperCase() + position.slice(1) : '',
      cabinetName: cabinet?.name ?? '',
      cabinetAddress: (cabinet as any)?.address ?? '',
    };
  }

  /** Documents du dossier (ou du client) proposés en pièces jointes. */
  async attachableDocuments(info: TargetInfo, limit = 50): Promise<DocumentCustomer[]> {
    const qb = this.dataSource.getRepository(DocumentCustomer)
      .createQueryBuilder('d')
      .orderBy('d.id', 'DESC')
      .take(limit);
    if (info.dossier) qb.where('d.dossier_id = :id', { id: info.dossier.id });
    else if (info.client) qb.where('d.customer_id = :id', { id: info.client.id });
    else return [];
    return qb.getMany();
  }

  /** Documents choisis, vérifiés dans le cabinet courant. */
  async documentsByIds(ids: number[]): Promise<DocumentCustomer[]> {
    if (!ids.length) return [];
    return this.dataSource.getRepository(DocumentCustomer).find({ where: { id: In(ids) } as any });
  }
}
