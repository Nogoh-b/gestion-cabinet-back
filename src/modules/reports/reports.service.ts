import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Between, Repository } from 'typeorm';

import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { addTenantCondition } from 'src/core/tenant/tenant-repository.patch';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { Audience, AudienceStatus } from '../audiences/entities/audience.entity';
import { Facture } from '../facture/entities/facture.entity';
import { Paiement } from '../paiement/entities/paiement.entity';
import { ExpenseReport } from '../supplier/entities/expense-report.entity';
import { PlanQuotaService } from '../plans/plan-quota.service';

/** Statuts de facture « émise » (hors brouillon / annulée). */
const FACTURE_SENT = [1, 2, 3, 6]; // ENVOYEE, PARTIELLEMENT_PAYEE, PAYEE, VALIDEE
/** Créances validées avec un solde restant ; le retard est calculé. */
const FACTURE_UNPAID = [2, 6]; // PARTIELLEMENT_PAYEE, VALIDEE

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
    @InjectRepository(Dossier) private readonly dossierRepo: Repository<Dossier>,
    @InjectRepository(Audience) private readonly audienceRepo: Repository<Audience>,
    @InjectRepository(Facture) private readonly factureRepo: Repository<Facture>,
    @InjectRepository(Paiement) private readonly paiementRepo: Repository<Paiement>,
    @InjectRepository(ExpenseReport) private readonly expenseRepo: Repository<ExpenseReport>,
    private readonly planQuota: PlanQuotaService,
  ) {}

  /** Rapport avancé (gardé par le module `reporting` du plan). */
  async getAdvanced(from?: string, to?: string, compare = false) {
    const tenantId = getCurrentTenantId();
    await this.planQuota.checkModuleEnabled(tenantId, 'reporting');

    const end = to ? new Date(to) : new Date();
    const start = from ? new Date(from) : new Date(end.getFullYear(), end.getMonth(), 1);
    end.setHours(23, 59, 59, 999);
    start.setHours(0, 0, 0, 0);

    const current = await this.computeWindow(start, end);
    const evolution = await this.evolutionSection(start, end).catch((e) => this.fail('evolution', e) && []);

    let previous: any = null;
    if (compare) {
      const span = end.getTime() - start.getTime();
      const prevEnd = new Date(start.getTime() - 1);
      const prevStart = new Date(prevEnd.getTime() - span);
      previous = await this.computeWindow(prevStart, prevEnd);
    }

    return {
      period: { from: start.toISOString(), to: end.toISOString() },
      compare,
      ...current,
      evolution,
      previous,
    };
  }

  // ── Évolution mensuelle (tendance sur la période) ──────────────────────────
  private async evolutionSection(start: Date, end: Date) {
    const monthCol = (col: string) => `DATE_FORMAT(${col}, '%Y-%m')`;
    const map = new Map<string, { month: string; opened: number; closed: number; billed: number; collected: number }>();
    const bucket = (m: string) => {
      if (!map.has(m)) map.set(m, { month: m, opened: 0, closed: 0, billed: 0, collected: 0 });
      return map.get(m)!;
    };

    const opened = await this.scoped(this.dossierRepo, 'd')
      .select(monthCol('d.opening_date'), 'm').addSelect('COUNT(*)', 'c')
      .andWhere('d.opening_date BETWEEN :s AND :e', { s: start, e: end })
      .groupBy('m').getRawMany();
    opened.forEach((r) => { if (r.m) bucket(r.m).opened = num(r.c); });

    const closed = await this.scoped(this.dossierRepo, 'd')
      .select(monthCol('d.closing_date'), 'm').addSelect('COUNT(*)', 'c')
      .andWhere('d.closing_date BETWEEN :s AND :e', { s: start, e: end })
      .groupBy('m').getRawMany();
    closed.forEach((r) => { if (r.m) bucket(r.m).closed = num(r.c); });

    const billed = await this.scoped(this.factureRepo, 'f')
      .select(monthCol('f.dateFacture'), 'm').addSelect('COALESCE(SUM(f.montantTTC),0)', 's')
      .andWhere('f.dateFacture BETWEEN :s AND :e', { s: start, e: end })
      .andWhere('f.status IN (:...st)', { st: FACTURE_SENT })
      .groupBy('m').getRawMany();
    billed.forEach((r) => { if (r.m) bucket(r.m).billed = num(r.s); });

    const collected = await this.scoped(this.paiementRepo, 'p')
      .select(monthCol('p.datePaiement'), 'm').addSelect('COALESCE(SUM(p.montant),0)', 's')
      .andWhere('p.datePaiement BETWEEN :s AND :e', { s: start, e: end })
      .groupBy('m').getRawMany();
    collected.forEach((r) => { if (r.m) bucket(r.m).collected = num(r.s); });

    return Array.from(map.values()).sort((a, b) => (a.month < b.month ? -1 : 1));
  }

  private async computeWindow(start: Date, end: Date) {
    const [dossiers, audiences, finances] = await Promise.all([
      this.dossierSection(start, end).catch((e) => this.fail('dossiers', e)),
      this.audienceSection(start, end).catch((e) => this.fail('audiences', e)),
      this.financeSection(start, end).catch((e) => this.fail('finances', e)),
    ]);
    return { dossiers, audiences, finances };
  }

  private fail(section: string, e: any) {
    this.logger.warn(`[Reports] section ${section} échouée: ${e?.message ?? e}`);
    return {};
  }

  private scoped(repo: Repository<any>, alias: string) {
    return addTenantCondition(repo.createQueryBuilder(alias), alias);
  }

  // ── Dossiers ───────────────────────────────────────────────────────────────
  private async dossierSection(start: Date, end: Date) {
    const opened = await this.scoped(this.dossierRepo, 'd')
      .andWhere('d.opening_date BETWEEN :s AND :e', { s: start, e: end })
      .getCount();

    const outcomeRows = await this.scoped(this.dossierRepo, 'd')
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
    const decided = won + (byOutcome['lost'] ?? 0) + (byOutcome['settled'] ?? 0);

    const durRow = await this.scoped(this.dossierRepo, 'd')
      .select('AVG(DATEDIFF(d.closing_date, d.opening_date))', 'avg')
      .andWhere('d.closing_date BETWEEN :s AND :e', { s: start, e: end })
      .getRawOne();

    const byProcedure = await this.scoped(this.dossierRepo, 'd')
      .leftJoin('d.procedure_type', 'pt')
      .select('pt.name', 'name')
      .addSelect('COUNT(*)', 'cnt')
      .andWhere('d.opening_date BETWEEN :s AND :e', { s: start, e: end })
      .groupBy('pt.name')
      .orderBy('cnt', 'DESC')
      .limit(8)
      .getRawMany();

    const byLawyer = await this.scoped(this.dossierRepo, 'd')
      .leftJoin('d.lawyer', 'emp')
      .leftJoin('emp.user', 'u')
      .select("TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,'')))", 'name')
      .addSelect('COUNT(*)', 'cnt')
      .andWhere('d.opening_date BETWEEN :s AND :e', { s: start, e: end })
      .groupBy('d.lawyer_id')
      .orderBy('cnt', 'DESC')
      .limit(8)
      .getRawMany();

    return {
      opened,
      closed,
      byOutcome,
      successRatePct: pct(won, decided),
      avgDurationDays: Math.round(num(durRow?.avg)),
      byProcedureType: byProcedure.map((r) => ({ name: r.name ?? '—', count: num(r.cnt) })),
      byLawyer: byLawyer.map((r) => ({ name: r.name || '—', count: num(r.cnt) })),
    };
  }

  // ── Audiences ────────────────────────────────────────────────────────────
  private async audienceSection(start: Date, end: Date) {
    const rows = await this.scoped(this.audienceRepo, 'a')
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
    const scheduled = byStatus[AudienceStatus.SCHEDULED] ?? 0;

    const upcoming = await this.scoped(this.audienceRepo, 'a')
      .andWhere('a.audience_date > :now', { now: new Date() })
      .andWhere('a.status = :st', { st: AudienceStatus.SCHEDULED })
      .getCount();

    return {
      total,
      held,
      postponed,
      scheduled,
      upcoming,
      postponeRatePct: pct(postponed, total),
    };
  }

  // ── Finances ─────────────────────────────────────────────────────────────
  private async financeSection(start: Date, end: Date) {
    const billedRow = await this.scoped(this.factureRepo, 'f')
      .select('COALESCE(SUM(f.montantTTC),0)', 'sum')
      .andWhere('f.dateFacture BETWEEN :s AND :e', { s: start, e: end })
      .andWhere('f.status IN (:...st)', { st: FACTURE_SENT })
      .getRawOne();
    const billed = num(billedRow?.sum);

    const collectedRow = await this.scoped(this.paiementRepo, 'p')
      .select('COALESCE(SUM(p.montant),0)', 'sum')
      .andWhere('p.datePaiement BETWEEN :s AND :e', { s: start, e: end })
      .getRawOne();
    const collected = num(collectedRow?.sum);

    // Balance âgée des impayés (instantané « à ce jour »).
    const agingRow = await this.scoped(this.factureRepo, 'f')
      .select('COALESCE(SUM(CASE WHEN DATEDIFF(NOW(), f.dateEcheance) <= 30 THEN f.montantTTC ELSE 0 END),0)', 'd0')
      .addSelect('COALESCE(SUM(CASE WHEN DATEDIFF(NOW(), f.dateEcheance) BETWEEN 31 AND 60 THEN f.montantTTC ELSE 0 END),0)', 'd30')
      .addSelect('COALESCE(SUM(CASE WHEN DATEDIFF(NOW(), f.dateEcheance) BETWEEN 61 AND 90 THEN f.montantTTC ELSE 0 END),0)', 'd60')
      .addSelect('COALESCE(SUM(CASE WHEN DATEDIFF(NOW(), f.dateEcheance) > 90 THEN f.montantTTC ELSE 0 END),0)', 'd90')
      .andWhere('f.status IN (:...st)', { st: FACTURE_UNPAID })
      .getRawOne();
    const aging = {
      d0_30: num(agingRow?.d0),
      d30_60: num(agingRow?.d30),
      d60_90: num(agingRow?.d60),
      d90p: num(agingRow?.d90),
    };
    const unpaidTotal = aging.d0_30 + aging.d30_60 + aging.d60_90 + aging.d90p;

    const byClientRows = await this.scoped(this.factureRepo, 'f')
      .leftJoin('customer', 'c', 'c.id = f.client_id')
      .select("COALESCE(c.company_name, TRIM(CONCAT(COALESCE(c.first_name,''),' ',COALESCE(c.last_name,''))))", 'name')
      .addSelect('COALESCE(SUM(f.montantTTC),0)', 'sum')
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
      collected,
      recoveryRatePct: pct(collected, billed),
      unpaidTotal,
      aging,
      byClient: byClientRows.map((r) => ({ name: r.name || '—', amount: num(r.sum) })),
      expenses,
      margin: collected - expenses,
    };
  }
}
