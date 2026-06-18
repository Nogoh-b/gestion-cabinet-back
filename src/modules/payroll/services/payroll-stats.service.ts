import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Payslip } from '../entities/payslip.entity';
import { addTenantCondition } from 'src/core/tenant/tenant-repository.patch';

export interface PayrollOverview {
  total_gross: number;
  total_net: number;
  total_deductions: number;
  total_employer_charges: number;
  total_employer_cost: number; // brut + charges patronales
  payslip_count: number;
  by_status: Record<string, number>;
}

@Injectable()
export class PayrollStatsService {
  constructor(
    @InjectRepository(Payslip) private readonly payslipRepo: Repository<Payslip>,
  ) {}

  /** Vue d'ensemble de la masse salariale, optionnellement filtrée par période. */
  async overview(periodId?: number): Promise<PayrollOverview> {
    let qb = this.payslipRepo
      .createQueryBuilder('p')
      .select('COALESCE(SUM(p.gross_amount), 0)', 'gross')
      .addSelect('COALESCE(SUM(p.net_amount), 0)', 'net')
      .addSelect('COALESCE(SUM(p.total_employer_charges), 0)', 'employer')
      .addSelect('COUNT(p.id)', 'count');
    if (periodId) qb = qb.where('p.period_id = :periodId', { periodId });
    qb = addTenantCondition(qb, 'p');
    const row = await qb.getRawOne<{ gross: string; net: string; employer: string; count: string }>();

    const gross = Number(row?.gross ?? 0);
    const net = Number(row?.net ?? 0);
    const employer = Number(row?.employer ?? 0);

    // Répartition par statut
    let statusQb = this.payslipRepo
      .createQueryBuilder('p')
      .select('p.status', 'status')
      .addSelect('COUNT(p.id)', 'count')
      .groupBy('p.status');
    if (periodId) statusQb = statusQb.where('p.period_id = :periodId', { periodId });
    statusQb = addTenantCondition(statusQb, 'p');
    const statusRows = await statusQb.getRawMany<{ status: string; count: string }>();
    const by_status: Record<string, number> = {};
    for (const r of statusRows) by_status[r.status] = Number(r.count);

    return {
      total_gross: gross,
      total_net: net,
      total_deductions: Math.round((gross - net) * 100) / 100,
      total_employer_charges: employer,
      total_employer_cost: Math.round((gross + employer) * 100) / 100,
      payslip_count: Number(row?.count ?? 0),
      by_status,
    };
  }

  /** Masse salariale agrégée par période (utile pour un graphique d'évolution). */
  async byPeriod(): Promise<Array<{ period_id: number; period_label: string; total_gross: number; total_net: number; count: number }>> {
    let qb = this.payslipRepo
      .createQueryBuilder('p')
      .leftJoin('p.period', 'period')
      .select('p.period_id', 'period_id')
      .addSelect('period.label', 'period_label')
      .addSelect('COALESCE(SUM(p.gross_amount), 0)', 'gross')
      .addSelect('COALESCE(SUM(p.net_amount), 0)', 'net')
      .addSelect('COUNT(p.id)', 'count')
      .groupBy('p.period_id')
      .addGroupBy('period.label')
      .orderBy('p.period_id', 'DESC');
    qb = addTenantCondition(qb, 'p');
    const rows = await qb.getRawMany<any>();
    return rows.map((r) => ({
      period_id: Number(r.period_id),
      period_label: r.period_label,
      total_gross: Number(r.gross),
      total_net: Number(r.net),
      count: Number(r.count),
    }));
  }
}
