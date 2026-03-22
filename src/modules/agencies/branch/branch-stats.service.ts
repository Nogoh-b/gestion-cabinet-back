// src/modules/agencies/branch/services/branch-stats.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Branch } from './entities/branch.entity';
import { BranchStatsDto } from './dto/branch-stats.dto';
import { SingleBranchStatsDto } from './dto/single-branch-stats.dto';
import { StatsFilterDto } from 'src/core/types/base-stats.dto';
import { EmployeePosition } from './../employee/entities/employee.entity';
import { DossierStatus } from 'src/core/enums/dossier-status.enum';
import { AudienceStatus } from './../../audiences/entities/audience.entity';
import { StatutFacture } from './../../facture/dto/create-facture.dto';

@Injectable()
export class BranchStatsService {
  constructor(
    @InjectRepository(Branch)
    private branchRepository: Repository<Branch>,
  ) {}

  async getStats(filters?: StatsFilterDto): Promise<BranchStatsDto | SingleBranchStatsDto> {
    // Si un branchId est fourni, on retourne les stats détaillées de cette agence
    if (filters?.branchId) {
      return this.getStatsForSingleBranch(filters.branchId, filters);
    }

    // Sinon, on retourne les stats globales
    return this.getGlobalStats(filters);
  }

  // Méthode pour une agence spécifique
  private async getStatsForSingleBranch(
    branchId: number, 
    filters?: StatsFilterDto
  ): Promise<SingleBranchStatsDto> {
    const branch = await this.branchRepository.findOne({
      where: { id: branchId },
      relations: [
        'employees',
        'employees.user',
        'employees.managed_dossiers',
        'employees.managed_dossiers.client',
        'employees.managed_dossiers.audiences',
        'customers',
        'customers.dossiers',
        'customers.factures'
      ]
    });

    if (!branch) {
      throw new Error(`Agence avec ID ${branchId} non trouvée`);
    }

    const maintenant = new Date();
    const dateCondition = this.buildDateCondition(filters);

    return {
      agence: {
        id: branch.id,
        nom: branch.name,
        code: branch.code,
        ville: branch.location_city?.name || 'Non spécifiée',
        adresse: branch.full_address,
        telephone: branch.code,
        // email: branch.email,
        statut: branch.status,
        dateCreation: branch.created_at,
      },
      resume: await this.getResumeStats(branch, filters),
      employes: this.getEmployesStats(branch.employees || [], filters),
      clients: this.getClientsStats(branch.customers || [], filters),
      dossiers: await this.getDossiersStats(branch.employees || [], filters),
      audiences: await this.getAudiencesStats(branch.employees || [], filters),
      financier: await this.getFinancierStats(branch.customers || [], filters),
      performance: await this.getPerformanceStats(branch, filters),
    };
  }

  private async getResumeStats(branch: Branch, filters?: StatsFilterDto): Promise<SingleBranchStatsDto['resume']> {
    const employes = branch.employees || [];
    const clients = branch.customers || [];
    
    // Récupérer tous les dossiers des employés de l'agence
    const tousDossiers = employes.flatMap(e => e.managed_dossiers || []);
    
    // Filtrer par date si nécessaire
    const dossiersFiltres = this.filterByDate(tousDossiers, filters, 'created_at');
    const dossiersActifs = dossiersFiltres.filter(d => d.status !== DossierStatus.CLOSED && d.status !== DossierStatus.ARCHIVED);
    const dossiersClos = dossiersFiltres.filter(d => d.status === DossierStatus.CLOSED);

    // Récupérer toutes les audiences
    const toutesAudiences = dossiersFiltres.flatMap(d => d.audiences || []);
    const audiencesFiltrees = this.filterByDate(toutesAudiences, filters, 'created_at');

    // Récupérer toutes les factures
    const toutesFactures = clients.flatMap(c => c.factures || []);
    const facturesFiltrees = this.filterByDate(toutesFactures, filters, 'dateFacture');
    const chiffreAffaires = facturesFiltrees.reduce((sum, f) => sum + (parseFloat(f.montantTTC) || 0), 0);

    return {
      totalEmployes: employes.length,
      totalAvocats: employes.filter(e => e.position === EmployeePosition.AVOCAT).length,
      totalSecretaires: employes.filter(e => e.position === EmployeePosition.SECRETAIRE).length,
      totalAutresEmployes: employes.filter(e => 
        e.position !== EmployeePosition.AVOCAT && e.position !== EmployeePosition.SECRETAIRE
      ).length,
      totalClients: clients.length,
      totalDossiers: dossiersFiltres.length,
      totalDossiersActifs: dossiersActifs.length,
      totalDossiersClos: dossiersClos.length,
      totalAudiences: audiencesFiltrees.length,
      totalFactures: facturesFiltrees.length,
      chiffreAffaires,
    };
  }

  private getEmployesStats(employes: any[], filters?: StatsFilterDto): SingleBranchStatsDto['employes'] {
    const employesFiltres = this.filterByDate(employes, filters, 'created_at');
    const total = employesFiltres.length;

    // Répartition par poste
    const positionMap = new Map<string, number>();
    employesFiltres.forEach(e => {
      positionMap.set(e.position, (positionMap.get(e.position) || 0) + 1);
    });

    const positionLabels = {
      [EmployeePosition.AVOCAT]: 'Avocats',
      [EmployeePosition.SECRETAIRE]: 'Secrétaires',
      [EmployeePosition.ASSISTANT]: 'Assistants',
      [EmployeePosition.STAGIAIRE]: 'Stagiaires',
      [EmployeePosition.HUISSIER]: 'Huissiers',
      [EmployeePosition.ADMINISTRATIF]: 'Administratifs',
    };

    const positionColors = {
      [EmployeePosition.AVOCAT]: '#3b82f6',
      [EmployeePosition.SECRETAIRE]: '#10b981',
      [EmployeePosition.ASSISTANT]: '#f59e0b',
      [EmployeePosition.STAGIAIRE]: '#8b5cf6',
      [EmployeePosition.HUISSIER]: '#ec4899',
      [EmployeePosition.ADMINISTRATIF]: '#6b7280',
    };

    const parPosition = Array.from(positionMap.entries()).map(([position, count]) => ({
      position: positionLabels[position] || position,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      color: positionColors[position] || '#6b7280',
    }));

    // Employés récents
    const recents = [...employesFiltres]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10)
      .map(e => ({
        id: e.id,
        nom: e.full_name,
        position: e.position,
        dateEmbauche: e.hireDate,
        dossiersActifs: e.managed_dossiers?.filter(d => d.is_active).length || 0,
      }));

    // Top performers
    const topPerformers = employesFiltres
      .filter(e => e.position === EmployeePosition.AVOCAT)
      .map(e => {
        const dossiers = e.managed_dossiers || [];
        const dossiersClos = dossiers.filter(d => d.status === DossierStatus.CLOSED).length;
        const audiences = dossiers.flatMap(d => d.audiences || []);
        
        return {
          id: e.id,
          nom: e.full_name,
          position: e.position,
          dossiers: dossiers.length,
          audiences: audiences.length,
          tauxSucces: dossiers.length > 0 ? Math.round((dossiersClos / dossiers.length) * 100) : 0,
        };
      })
      .sort((a, b) => b.tauxSucces - a.tauxSucces)
      .slice(0, 5);

    return {
      parPosition,
      recents,
      topPerformers,
    };
  }

  private getClientsStats(clients: any[], filters?: StatsFilterDto): SingleBranchStatsDto['clients'] {
    const clientsFiltres = this.filterByDate(clients, filters, 'created_at');
    const total = clientsFiltres.length;

    // Répartition par type
    const typeMap = new Map<string, number>();
    clientsFiltres.forEach(c => {
      const type = c.type_customer?.name || 'Non spécifié';
      typeMap.set(type, (typeMap.get(type) || 0) + 1);
    });

    const parType = Array.from(typeMap.entries()).map(([type, count]) => ({
      type,
      count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
    }));

    // Clients récents
    const recents = [...clientsFiltres]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10)
      .map(c => ({
        id: c.id,
        nom: c.full_name,
        email: c.email,
        dateCreation: c.created_at,
        dossierCount: c.dossiers?.length || 0,
      }));

    // Top clients par montant
    const topClients = clientsFiltres
      .map(c => ({
        id: c.id,
        nom: c.full_name,
        dossierCount: c.dossiers?.length || 0,
        montantTotal: (c.factures || []).reduce((sum, f) => sum + (parseFloat(f.montantTTC) || 0), 0),
      }))
      .sort((a, b) => b.montantTotal - a.montantTotal)
      .slice(0, 5);

    return {
      total,
      parType,
      recents,
      topClients,
    };
  }

  private async getDossiersStats(employes: any[], filters?: StatsFilterDto): Promise<SingleBranchStatsDto['dossiers']> {
    const tousDossiers = employes.flatMap(e => e.managed_dossiers || []);
    const dossiersFiltres = this.filterByDate(tousDossiers, filters, 'created_at');
    const total = dossiersFiltres.length;

    // Stats par statut
    const byStatusMap = new Map<number, number>();
    dossiersFiltres.forEach(d => {
      byStatusMap.set(d.status, (byStatusMap.get(d.status) || 0) + 1);
    });

    const statusLabels = {
      [DossierStatus.OPEN]: 'Ouvert',
      [DossierStatus.AMICABLE]: 'Amiable',
      [DossierStatus.LITIGATION]: 'Contentieux',
      // [DossierStatus.DECISION]: 'Décision',
      [DossierStatus.APPEAL]: 'Recours',
      [DossierStatus.CLOSED]: 'Clôturé',
      [DossierStatus.ARCHIVED]: 'Archivé',
    };

    const statusColors = {
      [DossierStatus.OPEN]: '#3b82f6',
      [DossierStatus.AMICABLE]: '#10b981',
      [DossierStatus.LITIGATION]: '#f59e0b',
      // [DossierStatus.DECISION]: '#8b5cf6',
      [DossierStatus.APPEAL]: '#ef4444',
      [DossierStatus.CLOSED]: '#6b7280',
      [DossierStatus.ARCHIVED]: '#9ca3af',
    };

    const parStatut = Array.from(byStatusMap.entries()).map(([status, count]) => ({
      name: statusLabels[status] || 'Inconnu',
      value: count,
      percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      color: statusColors[status] || '#6b7280',
    }));

    // Stats par type de procédure
    const typeMap = new Map<string, number>();
    dossiersFiltres.forEach(d => {
      const type = d.procedure_type?.name || 'Non spécifié';
      typeMap.set(type, (typeMap.get(type) || 0) + 1);
    });

    const parType = Array.from(typeMap.entries())
      .map(([type, count]) => ({
        type,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    // Évolution mensuelle
    const evolution = this.getMonthlyEvolution(dossiersFiltres, 'created_at');

    // Dossiers récents
    const recents = [...dossiersFiltres]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 10)
      .map(d => {
        const avocat = employes.find(e => e.id === d.lawyer_id);
        return {
          id: d.id,
          numero: d.dossier_number,
          objet: d.object,
          client: d.client?.full_name,
          avocat: avocat?.full_name || 'Non assigné',
          statut: d.status,
          dateOuverture: d.opening_date,
        };
      });

    return {
      total,
      parStatut,
      parType,
      evolution,
      recents,
    };
  }

  private async getAudiencesStats(employes: any[], filters?: StatsFilterDto): Promise<SingleBranchStatsDto['audiences']> {
    const tousDossiers = employes.flatMap(e => e.managed_dossiers || []);
    const toutesAudiences = tousDossiers.flatMap(d => d.audiences || []);
    const audiencesFiltrees = this.filterByDate(toutesAudiences, filters, 'created_at');
    const maintenant = new Date();

    const passees = audiencesFiltrees.filter(a => new Date(a.full_datetime) < maintenant).length;
    const aVenir = audiencesFiltrees.filter(a => 
      new Date(a.full_datetime) >= maintenant && a.status === AudienceStatus.SCHEDULED
    ).length;
    const annulees = audiencesFiltrees.filter(a => a.status === AudienceStatus.CANCELLED).length;

    // Prochaine audience
    const prochaines = audiencesFiltrees
      .filter(a => new Date(a.full_datetime) >= maintenant && a.status === AudienceStatus.SCHEDULED)
      .sort((a, b) => new Date(a.full_datetime).getTime() - new Date(b.full_datetime).getTime());

    const prochaine = prochaines.length > 0 ? {
      id: prochaines[0].id,
      titre: prochaines[0].title,
      date: prochaines[0].full_datetime,
      dossier: prochaines[0].dossier?.dossier_number,
      client: prochaines[0].dossier?.client?.full_name,
    } : undefined;

    return {
      total: audiencesFiltrees.length,
      passees,
      aVenir,
      annulees,
      prochaine,
    };
  }

  private async getFinancierStats(clients: any[], filters?: StatsFilterDto): Promise<SingleBranchStatsDto['financier']> {
    const toutesFactures = clients.flatMap(c => c.factures || []);
    const facturesFiltrees = this.filterByDate(toutesFactures, filters, 'dateFacture');

    const chiffreAffaires = facturesFiltrees.reduce((sum, f) => sum + (parseFloat(f.montantTTC) || 0), 0);
    const montantPaye = facturesFiltrees
      .filter(f => f.status === StatutFacture.PAYEE)
      .reduce((sum, f) => sum + (parseFloat(f.montantTTC) || 0), 0);
    const montantImpaye = chiffreAffaires - montantPaye;
    const tauxRecouvrement = chiffreAffaires > 0 ? Math.round((montantPaye / chiffreAffaires) * 100) : 0;

    const facturesEmises = facturesFiltrees.length;
    const facturesPayees = facturesFiltrees.filter(f => f.status === StatutFacture.PAYEE).length;
    const facturesImpayees = facturesFiltrees.filter(f => 
      f.status !== StatutFacture.PAYEE && f.status !== StatutFacture.ANNULEE
    ).length;

    // Évolution du CA par mois
    const evolutionCA = this.getMonthlyFinancialEvolution(facturesFiltrees);

    return {
      chiffreAffaires,
      montantPaye,
      montantImpaye,
      tauxRecouvrement,
      facturesEmises,
      facturesPayees,
      facturesImpayees,
      evolutionCA,
    };
  }

  private async getPerformanceStats(branch: Branch, filters?: StatsFilterDto): Promise<SingleBranchStatsDto['performance']> {
    const employes = branch.employees || [];
    const avocats = employes.filter(e => e.position === EmployeePosition.AVOCAT);
    
    const tousDossiers = employes.flatMap(e => e.managed_dossiers || []);
    const dossiersFiltres = this.filterByDate(tousDossiers, filters, 'created_at');
    const dossiersClos = dossiersFiltres.filter(d => d.status === DossierStatus.CLOSED);
    
    const toutesAudiences = dossiersFiltres.flatMap(d => d.audiences || []);
    const audiencesTenues = toutesAudiences.filter(a => a.status === AudienceStatus.HELD);

    // Taux d'occupation des employés (basé sur le nombre de dossiers actifs par rapport à la capacité)
    const capaciteTotale = avocats.reduce((sum, a) => sum + (a.max_dossiers || 50), 0);
    const dossiersActifs = dossiersFiltres.filter(d => d.is_active).length;
    const tauxOccupationEmployes = capaciteTotale > 0 ? Math.round((dossiersActifs / capaciteTotale) * 100) : 0;

    // Moyenne de dossiers par avocat
    const moyenneDossiersParAvocat = avocats.length > 0 
      ? Math.round(dossiersFiltres.length / avocats.length) 
      : 0;

    // Taux de résolution des dossiers
    const tauxResolutionDossiers = dossiersFiltres.length > 0 
      ? Math.round((dossiersClos.length / dossiersFiltres.length) * 100) 
      : 0;

    // Taux d'audiences tenues
    const tauxAudiencesTenues = toutesAudiences.length > 0 
      ? Math.round((audiencesTenues.length / toutesAudiences.length) * 100) 
      : 0;

    return {
      tauxOccupationEmployes,
      moyenneDossiersParAvocat,
      tauxResolutionDossiers,
      tauxAudiencesTenues,
    };
  }

  // Méthode existante pour les stats globales
  private async getGlobalStats(filters?: StatsFilterDto): Promise<BranchStatsDto> {
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

  private filterByDate(items: any[], filters?: StatsFilterDto, dateField: string = 'created_at'): any[] {
    if (!filters?.startDate && !filters?.endDate) return items;
    
    return items.filter(item => {
      const itemDate = new Date(item[dateField]);
      if (filters?.startDate && itemDate < new Date(filters.startDate)) return false;
      if (filters?.endDate && itemDate > new Date(filters.endDate)) return false;
      return true;
    });
  }

  private getMonthlyEvolution(items: any[], dateField: string): Array<{ mois: string; count: number }> {
    const evolutionMap = new Map<string, number>();
    const sixMoisAvant = new Date();
    sixMoisAvant.setMonth(sixMoisAvant.getMonth() - 6);

    items
      .filter(item => new Date(item[dateField]) >= sixMoisAvant)
      .forEach(item => {
        const date = new Date(item[dateField]);
        const mois = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        evolutionMap.set(mois, (evolutionMap.get(mois) || 0) + 1);
      });

    return Array.from(evolutionMap.entries())
      .map(([mois, count]) => ({ mois, count }))
      .sort((a, b) => a.mois.localeCompare(b.mois));
  }

  private getMonthlyFinancialEvolution(factures: any[]): Array<{ mois: string; montant: number }> {
    const evolutionMap = new Map<string, number>();
    const sixMoisAvant = new Date();
    sixMoisAvant.setMonth(sixMoisAvant.getMonth() - 6);

    factures
      .filter(f => new Date(f.dateFacture) >= sixMoisAvant)
      .forEach(f => {
        const date = new Date(f.dateFacture);
        const mois = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const montant = parseFloat(f.montantTTC) || 0;
        evolutionMap.set(mois, (evolutionMap.get(mois) || 0) + montant);
      });

    return Array.from(evolutionMap.entries())
      .map(([mois, montant]) => ({ mois, montant }))
      .sort((a, b) => a.mois.localeCompare(b.mois));
  }

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