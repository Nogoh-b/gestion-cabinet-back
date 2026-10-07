import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';

import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { addTenantCondition } from 'src/core/tenant/tenant-repository.patch';
import { Dossier } from '../dossiers/entities/dossier.entity';
import {
  Audience,
  AudienceStatus,
} from '../audiences/entities/audience.entity';
import { Facture } from '../facture/entities/facture.entity';
import { Paiement } from '../paiement/entities/paiement.entity';
import { Diligence, DiligenceStatus } from '../diligence/entities/diligence.entity';
import {
  DocumentCustomer,
  DocumentCustomerStatus,
} from '../documents/document-customer/entities/document-customer.entity';
import { ExpenseReport } from '../supplier/entities/expense-report.entity';
import { PlanQuotaService } from '../plans/plan-quota.service';
import { canBypassConfidentiality } from '../dossiers/dossier-visibility';
import { getCurrentRequestUser } from 'src/core/security/request-user.context';

/** Statuts de facture « émise » (hors brouillon / annulée). */
const FACTURE_SENT = [1, 2, 3, 4]; // ENVOYEE, PARTIELLEMENT_PAYEE, PAYEE, IMPAYEE
/** Statuts de facture « impayée » (reste dû). */
const FACTURE_UNPAID = [1, 2, 4]; // ENVOYEE, PARTIELLEMENT_PAYEE, IMPAYEE

/** Statuts de diligence encore « à traiter » (ni terminée, ni annulée). */
const DILIGENCE_CLOSED = [
  DiligenceStatus.COMPLETED,
  DiligenceStatus.CANCELLED,
];

/** Sous-requête des dossiers confidentiels explicitement ouverts à l'appelant. */
const GRANTED_DOSSIER_IDS_SQL = `
  SELECT g.dossier_id
    FROM dossier_access_grant g
   WHERE g.employee_id = :__confidentialUserId
     AND g.revoked_at IS NULL
     AND g.deleted_at IS NULL
`;

function num(v: any): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}
function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0;
}

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @InjectRepository(Dossier)
    private readonly dossierRepo: Repository<Dossier>,
    @InjectRepository(Audience)
    private readonly audienceRepo: Repository<Audience>,
    @InjectRepository(Facture)
    private readonly factureRepo: Repository<Facture>,
    @InjectRepository(Paiement)
    private readonly paiementRepo: Repository<Paiement>,
    @InjectRepository(Diligence)
    private readonly diligenceRepo: Repository<Diligence>,
    @InjectRepository(DocumentCustomer)
    private readonly documentRepo: Repository<DocumentCustomer>,
    @InjectRepository(ExpenseReport)
    private readonly expenseRepo: Repository<ExpenseReport>,
    private readonly planQuota: PlanQuotaService,
  ) {}

  /**
   * Rapport avancé (gardé par le module `reporting` du plan).
   *
   * `includeConfidential` est une **préférence d'affichage** : les dossiers
   * confidentiels sont exclus par défaut des agrégats, et l'administration
   * (seule habilitée) peut les réintégrer. Un appelant sans le droit
   * `view_dossier_confidential` n'agrège jamais ces dossiers, quel que soit
   * le paramètre transmis.
   */
  async getAdvanced(
    from?: string,
    to?: string,
    compare = false,
    includeConfidential = false,
  ) {
    const tenantId = getCurrentTenantId();
    await this.planQuota.checkModuleEnabled(tenantId, 'reporting');

    const end = to ? new Date(to) : new Date();
    const start = from
      ? new Date(from)
      : new Date(end.getFullYear(), end.getMonth(), 1);
    end.setHours(23, 59, 59, 999);
    start.setHours(0, 0, 0, 0);

    // Sécurité : la préférence d'affichage ne peut pas élargir les droits.
    const confidentialScope = this.withConfidential(includeConfidential);

    const current = await this.computeWindow(start, end, confidentialScope);
    const evolution = await this.evolutionSection(
      start,
      end,
      confidentialScope,
    ).catch((e) => this.fail('evolution', e) && []);

    let previous: any = null;
    if (compare) {
      const span = end.getTime() - start.getTime();
      const prevEnd = new Date(start.getTime() - 1);
      const prevStart = new Date(prevEnd.getTime() - span);
      previous = await this.computeWindow(
        prevStart,
        prevEnd,
        confidentialScope,
      );
    }

    return {
      period: { from: start.toISOString(), to: end.toISOString() },
      compare,
      includeConfidential: confidentialScope,
      // Vrai si l'appelant a le droit de basculer l'inclusion : l'interface
      // n'affiche l'interrupteur qu'à ces profils.
      canIncludeConfidential: canBypassConfidentiality(),
      ...current,
      evolution,
      previous,
    };
  }

  // ── Évolution mensuelle (tendance sur la période) ──────────────────────────
  private async evolutionSection(
    start: Date,
    end: Date,
    includeConfidential: boolean,
  ) {
    const monthCol = (col: string) => `DATE_FORMAT(${col}, '%Y-%m')`;
    const map = new Map<
      string,
      {
        month: string;
        opened: number;
        closed: number;
        billed: number;
        collected: number;
      }
    >();
    const bucket = (m: string) => {
      if (!map.has(m))
        map.set(m, { month: m, opened: 0, closed: 0, billed: 0, collected: 0 });
      return map.get(m)!;
    };

    const opened = await this.confidentialScope(
      this.scoped(this.dossierRepo, 'd'),
      'd',
      'confidentiality_level',
      includeConfidential,
    )
      .select(monthCol('d.opening_date'), 'm')
      .addSelect('COUNT(*)', 'c')
      .andWhere('d.opening_date BETWEEN :s AND :e', { s: start, e: end })
      .groupBy('m')
      .getRawMany();
    opened.forEach((r) => {
      if (r.m) bucket(r.m).opened = num(r.c);
    });

    const closed = await this.confidentialScope(
      this.scoped(this.dossierRepo, 'd'),
      'd',
      'confidentiality_level',
      includeConfidential,
    )
      .select(monthCol('d.closing_date'), 'm')
      .addSelect('COUNT(*)', 'c')
      .andWhere('d.closing_date BETWEEN :s AND :e', { s: start, e: end })
      .groupBy('m')
      .getRawMany();
    closed.forEach((r) => {
      if (r.m) bucket(r.m).closed = num(r.c);
    });

    const billed = await this.confidentialScope(
      this.scoped(this.factureRepo, 'f'),
      'f',
      'dossier_id',
      includeConfidential,
    )
      .select(monthCol('f.dateFacture'), 'm')
      .addSelect('COALESCE(SUM(f.montantTTC),0)', 's')
      .andWhere('f.dateFacture BETWEEN :s AND :e', { s: start, e: end })
      .andWhere('f.status IN (:...st)', { st: FACTURE_SENT })
      .groupBy('m')
      .getRawMany();
    billed.forEach((r) => {
      if (r.m) bucket(r.m).billed = num(r.s);
    });

    const collected = await this.confidentialScope(
      this.scoped(this.paiementRepo, 'p').leftJoin(
        Facture,
        'pf',
        'pf.id = p.facture_id',
      ),
      'pf',
      'dossier_id',
      includeConfidential,
    )
      .select(monthCol('p.datePaiement'), 'm')
      .addSelect('COALESCE(SUM(p.montant),0)', 's')
      .andWhere('p.datePaiement BETWEEN :s AND :e', { s: start, e: end })
      .groupBy('m')
      .getRawMany();
    collected.forEach((r) => {
      if (r.m) bucket(r.m).collected = num(r.s);
    });

    return Array.from(map.values()).sort((a, b) =>
      a.month < b.month ? -1 : 1,
    );
  }

  private async computeWindow(
    start: Date,
    end: Date,
    includeConfidential: boolean,
  ) {
    const [dossiers, audiences, finances, diligences, documents] =
      await Promise.all([
        this.dossierSection(start, end, includeConfidential).catch((e) =>
          this.fail('dossiers', e),
        ),
        this.audienceSection(start, end, includeConfidential).catch((e) =>
          this.fail('audiences', e),
        ),
        this.financeSection(start, end, includeConfidential).catch((e) =>
          this.fail('finances', e),
        ),
        this.diligenceSection(start, end, includeConfidential).catch((e) =>
          this.fail('diligences', e),
        ),
        this.documentSection(start, end, includeConfidential).catch((e) =>
          this.fail('documents', e),
        ),
      ]);
    return { dossiers, audiences, finances, diligences, documents };
  }

  private fail(section: string, e: any) {
    this.logger.warn(
      `[Reports] section ${section} échouée: ${e?.message ?? e}`,
    );
    return {};
  }

  /**
   * Restreint les agrégats aux dossiers non confidentiels. Sans effet pour un
   * appelant habilité qui a explicitement demandé à les inclure.
   */
  private withConfidential(includeConfidential: boolean): boolean {
    return canBypassConfidentiality() && includeConfidential === true;
  }

  /**
   * Applique la règle de confidentialité à un QueryBuilder d'agrégat.
   *
   * `alias` est l'alias de l'entité interrogée ; `dossierRef` désigne la
   * colonne qui porte le lien vers le dossier :
   *   - `'confidentiality_level'` quand l'entité **est** le dossier,
   *   - `'dossier_id'` quand elle y est rattachée (facture, diligence,
   *     audience, document…).
   *
   * Deux règles distinctes, comme partout ailleurs dans l'application :
   *   - un appelant non habilité ne voit **jamais** un dossier confidentiel,
   *     sauf autorisation nominative (`dossier_access_grant`) ;
   *   - un appelant habilité peut choisir de les inclure ou non.
   *
   * Les lignes sans dossier rattaché restent comptées : elles ne révèlent
   * rien d'un dossier confidentiel.
   */
  private confidentialScope<T extends object>(
    qb: SelectQueryBuilder<T>,
    alias: string,
    dossierRef: 'confidentiality_level' | 'dossier_id',
    includeConfidential: boolean,
  ): SelectQueryBuilder<T> {
    if (includeConfidential) return qb;

    const bypass = canBypassConfidentiality();
    const target =
      dossierRef === 'confidentiality_level'
        ? alias
        : `${alias}.dossier_id`;

    if (dossierRef === 'confidentiality_level') {
      // Le dossier lui-même : aucune ligne « sans dossier » à préserver.
      if (bypass) return qb.andWhere(`${alias}.confidentiality_level = false`);
      return qb.andWhere(
        `(${alias}.confidentiality_level = false` +
          ` OR ${alias}.id IN (${GRANTED_DOSSIER_IDS_SQL}))`,
        { __confidentialUserId: getCurrentRequestUser()?.userId },
      );
    }

    const nullClause = `${target} IS NULL OR `;

    if (bypass) {
      return qb.andWhere(
        `(${nullClause}${target} IN (` +
          `SELECT d.id FROM dossiers d WHERE d.confidentiality_level = false))`,
      );
    }

    return qb.andWhere(
      `(${nullClause}${target} IN (` +
        `SELECT d.id FROM dossiers d WHERE d.confidentiality_level = false)` +
        ` OR ${target} IN (${GRANTED_DOSSIER_IDS_SQL}))`,
      { __confidentialUserId: getCurrentRequestUser()?.userId },
    );
  }

  private scoped(repo: Repository<any>, alias: string) {
    return addTenantCondition(repo.createQueryBuilder(alias), alias);
  }

  // ── Dossiers ───────────────────────────────────────────────────────────────
  private async dossierSection(
    start: Date,
    end: Date,
    includeConfidential: boolean,
  ) {
    const scope = <T extends object>(qb: SelectQueryBuilder<T>) =>
      this.confidentialScope(qb, 'd', 'confidentiality_level', includeConfidential);

    const opened = await scope(this.scoped(this.dossierRepo, 'd'))
      .andWhere('d.opening_date BETWEEN :s AND :e', { s: start, e: end })
      .getCount();

    const outcomeRows = await scope(this.scoped(this.dossierRepo, 'd'))
      .select('d.outcome', 'outcome')
      .addSelect('COUNT(*)', 'cnt')
      .andWhere('d.closing_date BETWEEN :s AND :e', { s: start, e: end })
      .groupBy('d.outcome')
      .getRawMany();

    const byOutcome: Record<string, number> = {};
    let closed = 0;
    for (const r of outcomeRows) {
      byOutcome[r.outcome ?? 'unknown'] = num(r.cnt);
      closed += num(r.cnt);
    }
    const won = byOutcome['won'] ?? 0;
    const lost = byOutcome['lost'] ?? 0;
    const settled = byOutcome['settled'] ?? 0;
    const decided = won + lost + settled;

    const durRow = await scope(this.scoped(this.dossierRepo, 'd'))
      .select('AVG(DATEDIFF(d.closing_date, d.opening_date))', 'avg')
      .andWhere('d.closing_date BETWEEN :s AND :e', { s: start, e: end })
      .getRawOne();

    const byProcedure = await scope(this.scoped(this.dossierRepo, 'd'))
      .leftJoin('d.procedure_type', 'pt')
      .select('pt.name', 'name')
      .addSelect('COUNT(*)', 'cnt')
      .andWhere('d.opening_date BETWEEN :s AND :e', { s: start, e: end })
      .groupBy('pt.name')
      .orderBy('cnt', 'DESC')
      .limit(8)
      .getRawMany();

    const byLawyer = await scope(this.scoped(this.dossierRepo, 'd'))
      .leftJoin('d.lawyer', 'emp')
      .leftJoin('emp.user', 'u')
      .select(
        "TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,'')))",
        'name',
      )
      .addSelect('COUNT(*)', 'cnt')
      .andWhere('d.opening_date BETWEEN :s AND :e', { s: start, e: end })
      .groupBy('d.lawyer_id')
      .orderBy('cnt', 'DESC')
      .limit(8)
      .getRawMany();

    const byStatus = await scope(this.scoped(this.dossierRepo, 'd'))
      .select('d.status', 'status')
      .addSelect('COUNT(*)', 'cnt')
      .andWhere('d.opening_date BETWEEN :s AND :e', { s: start, e: end })
      .groupBy('d.status')
      .getRawMany();

    const byDanger = await scope(this.scoped(this.dossierRepo, 'd'))
      .select('d.danger_level', 'level')
      .addSelect('COUNT(*)', 'cnt')
      .andWhere('d.opening_date BETWEEN :s AND :e', { s: start, e: end })
      .groupBy('d.danger_level')
      .getRawMany();

    const urgent = await scope(this.scoped(this.dossierRepo, 'd'))
      .andWhere('d.opening_date BETWEEN :s AND :e', { s: start, e: end })
      .andWhere('d.danger_level IN (:...levels)', { levels: [2, 3] })
      .getCount();

    const confidentialCount = await this.scoped(this.dossierRepo, 'd')
      .andWhere('d.opening_date BETWEEN :s AND :e', { s: start, e: end })
      .andWhere('d.confidentiality_level = true')
      .getCount();

    return {
      opened,
      closed,
      byOutcome,
      won,
      lost,
      settled,
      successRatePct: pct(won, decided),
      avgDurationDays: Math.round(num(durRow?.avg)),
      avgPerMonth: this.averagePerMonth(opened, start, end),
      confidential: confidentialCount,
      urgent,
      byStatus: this.dossierStatusDistribution(byStatus),
      byDangerLevel: this.dangerDistribution(byDanger),
      byProcedureType: byProcedure.map((r) => ({
        name: r.name ?? '—',
        count: num(r.cnt),
      })),
      byLawyer: byLawyer.map((r) => ({
        name: r.name || '—',
        count: num(r.cnt),
      })),
    };
  }

  // ── Audiences ────────────────────────────────────────────────────────────
  private async audienceSection(
    start: Date,
    end: Date,
    includeConfidential: boolean,
  ) {
    const scope = <T extends object>(qb: SelectQueryBuilder<T>) =>
      this.confidentialScope(qb, 'a', 'dossier_id', includeConfidential);

    const rows = await scope(this.scoped(this.audienceRepo, 'a'))
      .select('a.status', 'status')
      .addSelect('COUNT(*)', 'cnt')
      .andWhere('a.audience_date BETWEEN :s AND :e', { s: start, e: end })
      .groupBy('a.status')
      .getRawMany();

    let total = 0;
    const byStatus: Record<number, number> = {};
    for (const r of rows) {
      byStatus[num(r.status)] = num(r.cnt);
      total += num(r.cnt);
    }
    const held = byStatus[AudienceStatus.HELD] ?? 0;
    const postponed = byStatus[AudienceStatus.POSTPONED] ?? 0;
    const cancelled = byStatus[AudienceStatus.CANCELLED] ?? 0;
    const scheduled = byStatus[AudienceStatus.SCHEDULED] ?? 0;

    // « À venir » : instantané à ce jour, indépendant de la période analysée.
    // Deux précautions : `audience_date` est une DATE (comparer à la date du
    // jour ne doit pas exclure les audiences du jour même) et l'enum numérique
    // doit être lié sous forme de chaîne, sinon MariaDB le lit comme un index.
    const upcoming = await scope(this.scoped(this.audienceRepo, 'a'))
      .andWhere('a.audience_date >= CURDATE()')
      .andWhere('a.status = :st', { st: String(AudienceStatus.SCHEDULED) })
      .getCount();

    const byJurisdiction = await scope(this.scoped(this.audienceRepo, 'a'))
      .leftJoin('a.jurisdiction', 'j')
      .select('j.name', 'name')
      .addSelect('COUNT(*)', 'cnt')
      .andWhere('a.audience_date BETWEEN :s AND :e', { s: start, e: end })
      .andWhere('j.id IS NOT NULL')
      .groupBy('j.name')
      .orderBy('cnt', 'DESC')
      .limit(8)
      .getRawMany();

    return {
      total,
      held,
      postponed,
      cancelled,
      scheduled,
      upcoming,
      postponeRatePct: pct(postponed, total),
      heldRatePct: pct(held, total),
      byJurisdiction: byJurisdiction.map((r) => ({
        name: r.name || '—',
        count: num(r.cnt),
      })),
    };
  }

  // ── Finances ─────────────────────────────────────────────────────────────
  private async financeSection(
    start: Date,
    end: Date,
    includeConfidential: boolean,
  ) {
    const billedRow = await this.confidentialScope(
      this.scoped(this.factureRepo, 'f'),
      'f',
      'dossier_id',
      includeConfidential,
    )
      .select('COALESCE(SUM(f.montantTTC),0)', 'sum')
      .addSelect('COUNT(*)', 'cnt')
      .andWhere('f.dateFacture BETWEEN :s AND :e', { s: start, e: end })
      .andWhere('f.status IN (:...st)', { st: FACTURE_SENT })
      .getRawOne();
    const billed = num(billedRow?.sum);
    const invoiceCount = num(billedRow?.cnt);

    const collectedRow = await this.confidentialScope(
      this.scoped(this.paiementRepo, 'p').leftJoin(
        Facture,
        'pf',
        'pf.id = p.facture_id',
      ),
      'pf',
      'dossier_id',
      includeConfidential,
    )
      .select('COALESCE(SUM(p.montant),0)', 'sum')
      .andWhere('p.datePaiement BETWEEN :s AND :e', { s: start, e: end })
      .getRawOne();
    const collected = num(collectedRow?.sum);

    // Balance âgée des impayés (instantané « à ce jour »).
    const agingRow = await this.confidentialScope(
      this.scoped(this.factureRepo, 'f'),
      'f',
      'dossier_id',
      includeConfidential,
    )
      .select(
        'COALESCE(SUM(CASE WHEN DATEDIFF(NOW(), f.dateEcheance) <= 30 THEN f.montantTTC ELSE 0 END),0)',
        'd0',
      )
      .addSelect(
        'COALESCE(SUM(CASE WHEN DATEDIFF(NOW(), f.dateEcheance) BETWEEN 31 AND 60 THEN f.montantTTC ELSE 0 END),0)',
        'd30',
      )
      .addSelect(
        'COALESCE(SUM(CASE WHEN DATEDIFF(NOW(), f.dateEcheance) BETWEEN 61 AND 90 THEN f.montantTTC ELSE 0 END),0)',
        'd60',
      )
      .addSelect(
        'COALESCE(SUM(CASE WHEN DATEDIFF(NOW(), f.dateEcheance) > 90 THEN f.montantTTC ELSE 0 END),0)',
        'd90',
      )
      .andWhere('f.status IN (:...st)', { st: FACTURE_UNPAID })
      .getRawOne();
    const aging = {
      d0_30: num(agingRow?.d0),
      d30_60: num(agingRow?.d30),
      d60_90: num(agingRow?.d60),
      d90p: num(agingRow?.d90),
    };
    const unpaidTotal = aging.d0_30 + aging.d30_60 + aging.d60_90 + aging.d90p;

    const byClientRows = await this.confidentialScope(
      this.scoped(this.factureRepo, 'f'),
      'f',
      'dossier_id',
      includeConfidential,
    )
      .leftJoin('customer', 'c', 'c.id = f.client_id')
      .select(
        "COALESCE(c.company_name, TRIM(CONCAT(COALESCE(c.first_name,''),' ',COALESCE(c.last_name,''))))",
        'name',
      )
      .addSelect('COALESCE(SUM(f.montantTTC),0)', 'sum')
      .addSelect('COUNT(*)', 'cnt')
      .andWhere('f.dateFacture BETWEEN :s AND :e', { s: start, e: end })
      .andWhere('f.status IN (:...st)', { st: FACTURE_SENT })
      .groupBy('f.client_id')
      .orderBy('sum', 'DESC')
      .limit(8)
      .getRawMany();

    const expensesRow = await this.scoped(this.expenseRepo, 'x')
      .select('COALESCE(SUM(x.total_amount),0)', 'sum')
      .andWhere('x.submission_date BETWEEN :s AND :e', { s: start, e: end })
      .getRawOne();
    const expenses = num(expensesRow?.sum);

    return {
      billed,
      invoiceCount,
      averageInvoice: invoiceCount > 0 ? billed / invoiceCount : 0,
      collected,
      recoveryRatePct: pct(collected, billed),
      unpaidTotal,
      aging,
      byClient: byClientRows.map((r) => ({
        name: r.name || '—',
        amount: num(r.sum),
        invoiceCount: num(r.cnt),
      })),
      expenses,
      margin: collected - expenses,
      marginRatePct: collected > 0 ? pct(collected - expenses, collected) : 0,
    };
  }

  // ── Diligences ───────────────────────────────────────────────────────────
  private async diligenceSection(
    start: Date,
    end: Date,
    includeConfidential: boolean,
  ) {
    const inPeriod = { s: start, e: end };
    const scope = <T extends object>(qb: SelectQueryBuilder<T>) =>
      this.confidentialScope(qb, 'dg', 'dossier_id', includeConfidential);

    const total = await scope(this.scoped(this.diligenceRepo, 'dg'))
      .andWhere('dg.start_date BETWEEN :s AND :e', inPeriod)
      .getCount();

    const byStatusRows = await scope(this.scoped(this.diligenceRepo, 'dg'))
      .select('dg.status', 'status')
      .addSelect('COUNT(*)', 'cnt')
      .andWhere('dg.start_date BETWEEN :s AND :e', inPeriod)
      .groupBy('dg.status')
      .getRawMany();

    const byStatus: Record<string, number> = {};
    for (const r of byStatusRows) byStatus[r.status ?? 'unknown'] = num(r.cnt);

    const completed = byStatus[DiligenceStatus.COMPLETED] ?? 0;
    const cancelled = byStatus[DiligenceStatus.CANCELLED] ?? 0;
    const inProgress =
      (byStatus[DiligenceStatus.IN_PROGRESS] ?? 0) +
      (byStatus[DiligenceStatus.REVIEW] ?? 0);

    // Overdue / échéances : instantané « à ce jour », hors période analysée.
    const overdue = await scope(this.scoped(this.diligenceRepo, 'dg'))
      .andWhere('dg.deadline < CURDATE()')
      .andWhere('dg.status NOT IN (:...closed)', {
        closed: DILIGENCE_CLOSED,
      })
      .getCount();

    const dueSoon = await scope(this.scoped(this.diligenceRepo, 'dg'))
      .andWhere('dg.deadline BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY)')
      .andWhere('dg.status NOT IN (:...closed)', {
        closed: DILIGENCE_CLOSED,
      })
      .getCount();

    const onTimeRow = await scope(this.scoped(this.diligenceRepo, 'dg'))
      .select('COUNT(*)', 'total')
      .addSelect(
        'SUM(CASE WHEN dg.completion_date IS NOT NULL AND dg.completion_date <= dg.deadline THEN 1 ELSE 0 END)',
        'onTime',
      )
      .andWhere('dg.status = :done', { done: DiligenceStatus.COMPLETED })
      .andWhere('dg.completion_date BETWEEN :s AND :e', inPeriod)
      .getRawOne();
    const completedOnTime = num(onTimeRow?.total);

    const avgRow = await scope(this.scoped(this.diligenceRepo, 'dg'))
      .select('AVG(DATEDIFF(dg.completion_date, dg.start_date))', 'avg')
      .andWhere('dg.status = :done', { done: DiligenceStatus.COMPLETED })
      .andWhere('dg.completion_date BETWEEN :s AND :e', inPeriod)
      .getRawOne();

    const byPriority = await scope(this.scoped(this.diligenceRepo, 'dg'))
      .select('dg.priority', 'priority')
      .addSelect('COUNT(*)', 'cnt')
      .andWhere('dg.start_date BETWEEN :s AND :e', inPeriod)
      .groupBy('dg.priority')
      .getRawMany();

    const byLawyer = await scope(this.scoped(this.diligenceRepo, 'dg'))
      .leftJoin('dg.assigned_lawyer', 'lw')
      .select(
        "TRIM(CONCAT(COALESCE(lw.first_name,''),' ',COALESCE(lw.last_name,'')))",
        'name',
      )
      .addSelect('COUNT(*)', 'cnt')
      .andWhere('dg.start_date BETWEEN :s AND :e', inPeriod)
      .andWhere('lw.id IS NOT NULL')
      .groupBy('dg.assigned_lawyer_id')
      .orderBy('cnt', 'DESC')
      .limit(8)
      .getRawMany();

    return {
      total,
      completed,
      cancelled,
      inProgress,
      overdue,
      dueSoon,
      completionRatePct: pct(completed, total),
      onTimeRatePct: pct(num(onTimeRow?.onTime), completedOnTime),
      avgDurationDays: Math.round(num(avgRow?.avg)),
      byStatus: Object.entries(byStatus).map(([status, count]) => ({
        name: this.diligenceStatusLabel(status),
        count,
      })),
      byPriority: byPriority.map((r) => ({
        name: this.diligencePriorityLabel(r.priority),
        count: num(r.cnt),
      })),
      byLawyer: byLawyer.map((r) => ({
        name: r.name || '—',
        count: num(r.cnt),
      })),
    };
  }

  // ── Documents ────────────────────────────────────────────────────────────
  private async documentSection(
    start: Date,
    end: Date,
    includeConfidential: boolean,
  ) {
    const inPeriod = { s: start, e: end };
    const scope = <T extends object>(qb: SelectQueryBuilder<T>) =>
      this.confidentialScope(qb, 'doc', 'dossier_id', includeConfidential);

    const total = await scope(this.scoped(this.documentRepo, 'doc'))
      .andWhere('doc.uploaded_at BETWEEN :s AND :e', inPeriod)
      .getCount();

    const byStatusRows = await scope(this.scoped(this.documentRepo, 'doc'))
      .select('doc.status', 'status')
      .addSelect('COUNT(*)', 'cnt')
      .andWhere('doc.uploaded_at BETWEEN :s AND :e', inPeriod)
      .groupBy('doc.status')
      .getRawMany();

    const byStatus: Record<number, number> = {};
    for (const r of byStatusRows) byStatus[num(r.status)] = num(r.cnt);

    const sizeRow = await scope(this.scoped(this.documentRepo, 'doc'))
      .select('COALESCE(SUM(doc.file_size),0)', 'sum')
      .andWhere('doc.uploaded_at BETWEEN :s AND :e', inPeriod)
      .getRawOne();

    const confidential = await scope(this.scoped(this.documentRepo, 'doc'))
      .andWhere('doc.uploaded_at BETWEEN :s AND :e', inPeriod)
      .andWhere('doc.is_confidential = true')
      .getCount();

    const byType = await scope(this.scoped(this.documentRepo, 'doc'))
      .leftJoin('doc.document_type', 'dt')
      .select('dt.name', 'name')
      .addSelect('COUNT(*)', 'cnt')
      .andWhere('doc.uploaded_at BETWEEN :s AND :e', inPeriod)
      .andWhere('dt.id IS NOT NULL')
      .groupBy('dt.name')
      .orderBy('cnt', 'DESC')
      .limit(8)
      .getRawMany();

    const byCategory = await scope(this.scoped(this.documentRepo, 'doc'))
      .leftJoin('doc.category', 'cat')
      .select('cat.name', 'name')
      .addSelect('COUNT(*)', 'cnt')
      .andWhere('doc.uploaded_at BETWEEN :s AND :e', inPeriod)
      .andWhere('cat.id IS NOT NULL')
      .groupBy('cat.name')
      .orderBy('cnt', 'DESC')
      .limit(8)
      .getRawMany();

    return {
      total,
      pendingValidation: byStatus[DocumentCustomerStatus.PENDING] ?? 0,
      validated: byStatus[DocumentCustomerStatus.ACCEPTED] ?? 0,
      refused: byStatus[DocumentCustomerStatus.REFUSED] ?? 0,
      expired: byStatus[DocumentCustomerStatus.EXPIRED] ?? 0,
      archived: byStatus[DocumentCustomerStatus.ARCHIVED] ?? 0,
      confidential,
      totalSize: num(sizeRow?.sum),
      validationRatePct: pct(
        byStatus[DocumentCustomerStatus.ACCEPTED] ?? 0,
        total,
      ),
      byStatus: Object.entries(byStatus).map(([status, count]) => ({
        name: this.documentStatusLabel(num(status)),
        count,
      })),
      byType: byType.map((r) => ({ name: r.name || '—', count: num(r.cnt) })),
      byCategory: byCategory.map((r) => ({
        name: r.name || '—',
        count: num(r.cnt),
      })),
    };
  }

  // ── Libellés ─────────────────────────────────────────────────────────────
  private averagePerMonth(count: number, start: Date, end: Date): number {
    const days =
      Math.max(1, end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24);
    return Math.round((count / (days / 30.44)) * 10) / 10;
  }

  private dossierStatusDistribution(rows: any[]) {
    const labels: Record<string, string> = {
      '0': 'Ouvert',
      '1': 'Amiable',
      '2': 'Contentieux',
      '3': 'Décision',
      '4': 'Recours',
      '5': 'Clôturé',
      '6': 'Archivé',
    };
    return rows.map((r) => ({
      name: labels[String(r.status)] ?? `Statut ${r.status}`,
      count: num(r.cnt),
    }));
  }

  private dangerDistribution(rows: any[]) {
    const labels: Record<string, string> = {
      '0': 'Faible',
      '1': 'Normal',
      '2': 'Élevé',
      '3': 'Critique',
    };
    return rows.map((r) => ({
      name: labels[String(r.level)] ?? `Niveau ${r.level}`,
      count: num(r.cnt),
    }));
  }

  private diligenceStatusLabel(status: string): string {
    const labels: Record<string, string> = {
      draft: 'Brouillon',
      in_progress: 'En cours',
      review: 'En révision',
      completed: 'Terminée',
      cancelled: 'Annulée',
    };
    return labels[status] ?? status;
  }

  private diligencePriorityLabel(priority: string): string {
    const labels: Record<string, string> = {
      low: 'Basse',
      medium: 'Moyenne',
      high: 'Haute',
      critical: 'Critique',
    };
    return labels[priority] ?? priority;
  }

  private documentStatusLabel(status: number): string {
    const labels: Record<number, string> = {
      [DocumentCustomerStatus.PENDING]: 'En attente',
      [DocumentCustomerStatus.ACCEPTED]: 'Validé',
      [DocumentCustomerStatus.REFUSED]: 'Refusé',
      [DocumentCustomerStatus.EXPIRED]: 'Expiré',
      [DocumentCustomerStatus.ARCHIVED]: 'Archivé',
    };
    return labels[status] ?? `Statut ${status}`;
  }
}
