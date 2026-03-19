// src/modules/agencies/branch/services/branch-stats.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Branch } from './entities/branch.entity';
import { BranchStatsDto } from './dto/branch-stats.dto';
import { StatsFilterDto } from 'src/core/types/base-stats.dto';
import { EmployeePosition } from '../employee/entities/employee.entity';

@Injectable()
export class BranchStatsService {
  constructor(
    @InjectRepository(Branch)
    private branchRepository: Repository<Branch>,
  ) {}

  async getStats(filters?: StatsFilterDto): Promise<BranchStatsDto> {
    // Appliquer les filtres de date aux différentes requêtes
    const dateCondition = this.buildDateCondition(filters);

    const total = await this.branchRepository.count();
    const active = await this.branchRepository.count({ where: { status: 1 } });

    // Employés par agence avec filtre de date
    const employeesQuery = this.branchRepository
      .createQueryBuilder('b')
      .leftJoin('b.employees', 'e')
      .leftJoin('e.user', 'u')
      .select('b.id', 'id')
      .addSelect('b.name', 'name')
      .addSelect('b.location_city_id', 'city')
      .addSelect('COUNT(DISTINCT e.id)', 'employees')
      .addSelect('SUM(CASE WHEN e.position = :avocat THEN 1 ELSE 0 END)', 'avocats')
      .addSelect('SUM(CASE WHEN e.position = :secretaire THEN 1 ELSE 0 END)', 'secretaires')
      .setParameters({
        avocat: EmployeePosition.AVOCAT,
        secretaire: EmployeePosition.SECRETAIRE,
      })
      .groupBy('b.id');

    // Appliquer le filtre de date sur les employés
    if (filters?.startDate) {
      employeesQuery.andWhere('e.created_at >= :startDate', { startDate: filters.startDate });
    }
    if (filters?.endDate) {
      employeesQuery.andWhere('e.created_at <= :endDate', { endDate: filters.endDate });
    }

    const employees = await employeesQuery.getRawMany();

    // Clients par agence avec filtre de date
    const customersQuery = this.branchRepository
      .createQueryBuilder('b')
      .leftJoin('b.customers', 'c')
      .leftJoin('c.type_customer', 't')
      .select('b.id', 'id')
      .addSelect('b.name', 'name')
      .addSelect('COUNT(DISTINCT c.id)', 'customers')
      .addSelect('SUM(CASE WHEN t.code = :part THEN 1 ELSE 0 END)', 'particuliers')
      .addSelect('SUM(CASE WHEN t.code = :pro THEN 1 ELSE 0 END)', 'professionnels')
      .setParameters({
        part: 'PART',
        pro: 'PRO',
      })
      .groupBy('b.id');

    // Appliquer le filtre de date sur les clients
    if (filters?.startDate) {
      customersQuery.andWhere('c.created_at >= :startDate', { startDate: filters.startDate });
    }
    if (filters?.endDate) {
      customersQuery.andWhere('c.created_at <= :endDate', { endDate: filters.endDate });
    }

    const customers = await customersQuery.getRawMany();

    // Dossiers par agence (via les avocats) avec filtre de date
    const dossiersQuery = this.branchRepository
      .createQueryBuilder('b')
      .leftJoin('b.employees', 'e')
      .leftJoin('e.managed_dossiers', 'd')
      .select('b.id', 'id')
      .addSelect('b.name', 'name')
      .addSelect('COUNT(DISTINCT d.id)', 'dossiers')
      .addSelect('SUM(CASE WHEN d.status IN (:...actifs) THEN 1 ELSE 0 END)', 'actifs')
      .addSelect('SUM(CASE WHEN d.status = :clos THEN 1 ELSE 0 END)', 'clos')
      .setParameters({
        actifs: [0, 1, 2, 3, 4],
        clos: 5,
      })
      .groupBy('b.id');

    // Appliquer le filtre de date sur les dossiers
    if (filters?.startDate) {
      dossiersQuery.andWhere('d.created_at >= :startDate', { startDate: filters.startDate });
    }
    if (filters?.endDate) {
      dossiersQuery.andWhere('d.created_at <= :endDate', { endDate: filters.endDate });
    }

    const dossiers = await dossiersQuery.getRawMany();

    // Statistiques de performance par agence
    const performanceQuery = this.branchRepository
      .createQueryBuilder('b')
      .leftJoin('b.employees', 'e')
      .leftJoin('e.managed_dossiers', 'd')
      .leftJoin('d.audiences', 'a')
      .leftJoin('d.factures', 'f')
      .select('b.id', 'id')
      .addSelect('b.name', 'name')
      .addSelect('COUNT(DISTINCT d.id)', 'totalDossiers')
      .addSelect('SUM(CASE WHEN d.status = :clos THEN 1 ELSE 0 END)', 'dossiersClos')
      .addSelect('AVG(DATEDIFF(d.closing_date, d.opening_date))', 'avgCompletionTime')
      .addSelect('COUNT(DISTINCT a.id)', 'totalAudiences')
      .addSelect('SUM(CASE WHEN a.status = :tenue THEN 1 ELSE 0 END)', 'audiencesTenues')
      .addSelect('SUM(f.montantTTC)', 'chiffreAffaires')
      .addSelect('SUM(CASE WHEN f.status = :payee THEN f.montantTTC ELSE 0 END)', 'caRealise')
      .setParameters({
        clos: 5,
        tenue: 'held',
        payee: 'PAYEE',
      })
      .groupBy('b.id');

    // Appliquer le filtre de date sur les performances
    if (filters?.startDate) {
      performanceQuery.andWhere('d.created_at >= :startDate', { startDate: filters.startDate });
    }
    if (filters?.endDate) {
      performanceQuery.andWhere('d.created_at <= :endDate', { endDate: filters.endDate });
    }

    const performance = await performanceQuery.getRawMany();

    return {
      total,
      active,
      employeesByBranch: employees.map(e => ({
        id: parseInt(e.id),
        name: e.name,
        city: e.city,
        employees: parseInt(e.employees || 0),
        avocats: parseInt(e.avocats || 0),
        secretaires: parseInt(e.secretaires || 0),
      })),
      customersByBranch: customers.map(c => ({
        id: parseInt(c.id),
        name: c.name,
        customers: parseInt(c.customers || 0),
        particuliers: parseInt(c.particuliers || 0),
        professionnels: parseInt(c.professionnels || 0),
      })),
      dossiersByBranch: dossiers.map(d => ({
        id: parseInt(d.id),
        name: d.name,
        dossiers: parseInt(d.dossiers || 0),
        actifs: parseInt(d.actifs || 0),
        clos: parseInt(d.clos || 0),
      })),
      performanceByBranch: performance.map(p => ({
        id: parseInt(p.id),
        name: p.name,
        totalDossiers: parseInt(p.totalDossiers || 0),
        tauxResolution: parseInt(p.totalDossiers || 0) > 0 
          ? Math.round((parseInt(p.dossiersClos || 0) / parseInt(p.totalDossiers || 0)) * 100)
          : 0,
        delaiMoyenTraitement: Math.round(parseFloat(p.avgCompletionTime || 0)),
        totalAudiences: parseInt(p.totalAudiences || 0),
        tauxAudiencesTenues: parseInt(p.totalAudiences || 0) > 0
          ? Math.round((parseInt(p.audiencesTenues || 0) / parseInt(p.totalAudiences || 0)) * 100)
          : 0,
        chiffreAffaires: parseFloat(p.chiffreAffaires || 0),
        tauxRecouvrement: parseFloat(p.chiffreAffaires || 0) > 0
          ? Math.round((parseFloat(p.caRealise || 0) / parseFloat(p.chiffreAffaires || 0)) * 100)
          : 0,
      })),
    };
  }

  private buildDateCondition(filters?: StatsFilterDto): { condition: string; params: any } {
    const params: any = {};
    const conditions: string[] = [];

    if (filters?.startDate) {
      conditions.push('created_at >= :startDate');
      params.startDate = filters.startDate;
    }
    if (filters?.endDate) {
      conditions.push('created_at <= :endDate');
      params.endDate = filters.endDate;
    }

    return {
      condition: conditions.length > 0 ? 'AND ' + conditions.join(' AND ') : '',
      params,
    };
  }

  // Méthodes supplémentaires pour des statistiques spécifiques

  async getBranchPerformance(branchId: number, filters?: StatsFilterDto): Promise<any> {
    const query = this.branchRepository
      .createQueryBuilder('b')
      .leftJoin('b.employees', 'e')
      .leftJoin('e.managed_dossiers', 'd')
      .leftJoin('d.audiences', 'a')
      .leftJoin('d.factures', 'f')
      .select([
        'b.id',
        'b.name',
        'COUNT(DISTINCT e.id) as totalEmployees',
        'COUNT(DISTINCT d.id) as totalDossiers',
        'COUNT(DISTINCT a.id) as totalAudiences',
        'SUM(f.montantTTC) as chiffreAffaires',
      ])
      .where('b.id = :branchId', { branchId });

    if (filters?.startDate) {
      query.andWhere('d.created_at >= :startDate', { startDate: filters.startDate });
    }
    if (filters?.endDate) {
      query.andWhere('d.created_at <= :endDate', { endDate: filters.endDate });
    }

    return query.getRawOne();
  }

  async getBranchComparison(filters?: StatsFilterDto): Promise<any> {
    const branches = await this.branchRepository.find({
      relations: ['employees', 'customers'],
    });

    const comparison = await Promise.all(
      branches.map(async branch => {
        const stats = await this.getBranchPerformance(branch.id, filters);
        return {
          id: branch.id,
          name: branch.name,
          code: branch.code,
          city: branch.location_city?.name,
          employees: branch.employees?.length || 0,
          customers: branch.customers?.length || 0,
          performance: stats,
        };
      })
    );

    return comparison.sort((a, b) => (b.performance?.chiffreAffaires || 0) - (a.performance?.chiffreAffaires || 0));
  }
}