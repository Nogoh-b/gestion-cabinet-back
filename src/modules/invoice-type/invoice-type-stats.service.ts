// src/modules/invoice-type/services/invoice-type-stats.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InvoiceType, InvoiceTypeCategory, TaxRate } from './entities/invoice-type.entity';
import {
  InvoiceTypeStatsDto,
  InvoiceTypeCategoryStatsDto,
  InvoiceTypeTaxRateStatsDto,
  TopInvoiceTypeDto,
  InvoiceTypeUsageStatsDto
} from './dto/invoice-type-stats.dto';
import { SingleInvoiceTypeStatsDto } from './dto/single-invoice-type-stats.dto';
import { StatutFacture } from './../facture/dto/create-facture.dto';

@Injectable()
export class InvoiceTypeStatsService {
  constructor(
    @InjectRepository(InvoiceType)
    private invoiceTypeRepository: Repository<InvoiceType>,
  ) {}

  async getStats(typeId?: number): Promise<InvoiceTypeStatsDto | SingleInvoiceTypeStatsDto> {
    // Si un typeId est fourni, on retourne les stats détaillées de ce type
    if (typeId) {
      return this.getStatsForSingleType(typeId);
    }

    // Sinon, on retourne les stats globales
    return this.getGlobalStats();
  }

  // Méthode pour un type de facture spécifique
  private async getStatsForSingleType(typeId: number): Promise<SingleInvoiceTypeStatsDto> {
    const typeFacture = await this.invoiceTypeRepository.findOne({
      where: { id: typeId },
      relations: [
        'invoices',
        'invoices.client',
        'invoices.dossier'
      ]
    });

    if (!typeFacture) {
      throw new Error(`Type de facture avec ID ${typeId} non trouvé`);
    }

    const maintenant = new Date();
    const unAnAvant = new Date();
    unAnAvant.setFullYear(unAnAvant.getFullYear() - 1);

    return {
      typeFacture: {
        id: typeFacture.id,
        code: typeFacture.code,
        nom: typeFacture.name,
        description: typeFacture.description,
        categorie: this.getCategoryLabel(typeFacture.category),
        tauxTvaDefault: typeFacture.default_tax_rate,
        estFacturable: typeFacture.is_billable,
        necessiteApprobation: typeFacture.requires_approval,
        delaiPaiementDefault: typeFacture.default_payment_days,
        estActif: typeFacture.is_active,
        codeComptable: typeFacture.metadata?.accounting_code,
        uniteDefaut: typeFacture.metadata?.default_unit,
        prixDefaut: typeFacture.metadata?.default_price,
        exemptTVA: typeFacture.metadata?.vat_exempt,
        baseLegale: typeFacture.metadata?.legal_basis,
        dateCreation: typeFacture.created_at,
        dateMiseAJour: typeFacture.updated_at,
      },
      factures: this.getFacturesStats(typeFacture.invoices || []),
      clients: this.getClientsStats(typeFacture.invoices || []),
      dossiers: this.getDossiersStats(typeFacture.invoices || []),
      periodicite: this.getPeriodiciteStats(typeFacture.invoices || []),
      performance: this.getPerformanceStats(typeFacture.invoices || []),
      tendances: this.getTendancesStats(typeFacture.invoices || []),
    };
  }

  private getFacturesStats(invoices: any[]): SingleInvoiceTypeStatsDto['factures'] {
    const total = invoices.length;
    const montantTotal = invoices.reduce((sum, inv) => sum + (parseFloat(inv.montantTTC) || 0), 0);
    const montantPaye = invoices
      .filter(inv => inv.status === StatutFacture.PAYEE)
      .reduce((sum, inv) => sum + (parseFloat(inv.montantTTC) || 0), 0);
    const montantImpaye = montantTotal - montantPaye;

    // Stats par statut
    const byStatusMap = new Map<number, { count: number; montant: number }>();
    invoices.forEach(inv => {
      const status = inv.status || 0;
      const current = byStatusMap.get(status) || { count: 0, montant: 0 };
      byStatusMap.set(status, {
        count: current.count + 1,
        montant: current.montant + (parseFloat(inv.montantTTC) || 0),
      });
    });

    const statusLabels = {
      [StatutFacture.BROUILLON]: 'Brouillon',
      [StatutFacture.ENVOYEE]: 'Envoyée',
      [StatutFacture.PARTIELLEMENT_PAYEE]: 'Partiellement payée',
      [StatutFacture.PAYEE]: 'Payée',
      [StatutFacture.IMPAYEE]: 'Impayée',
      [StatutFacture.ANNULEE]: 'Annulée',
    };

    const statusColors = {
      [StatutFacture.BROUILLON]: '#9ca3af',
      [StatutFacture.ENVOYEE]: '#3b82f6',
      [StatutFacture.PARTIELLEMENT_PAYEE]: '#f59e0b',
      [StatutFacture.PAYEE]: '#10b981',
      [StatutFacture.IMPAYEE]: '#ef4444',
      [StatutFacture.ANNULEE]: '#6b7280',
    };

    const parStatut = Array.from(byStatusMap.entries()).map(([status, data]) => ({
      name: statusLabels[status] || 'Inconnu',
      value: data.count,
      montant: data.montant,
      percentage: total > 0 ? Math.round((data.count / total) * 100) : 0,
      color: statusColors[status] || '#6b7280',
    }));

    // Factures récentes
    const recents = [...invoices]
      .sort((a, b) => new Date(b.dateFacture).getTime() - new Date(a.dateFacture).getTime())
      .slice(0, 10)
      .map(inv => ({
        id: inv.id,
        numero: inv.numero,
        client: inv.client?.full_name,
        dossier: inv.dossier?.dossier_number,
        date: inv.dateFacture,
        montant: parseFloat(inv.montantTTC) || 0,
        statut: inv.status,
      }));

    // Évolution mensuelle
    const evolutionMensuelle = this.getMonthlyEvolution(invoices);

    return {
      total,
      montantTotal,
      montantPaye,
      montantImpaye,
      parStatut,
      recents,
      evolutionMensuelle,
    };
  }

  private getClientsStats(invoices: any[]): SingleInvoiceTypeStatsDto['clients'] {
    const clientMap = new Map<number, { nom: string; factureCount: number; montantTotal: number; dernierDate?: Date }>();

    invoices.forEach(inv => {
      if (inv.client) {
        const clientId = inv.client.id;
        const current = clientMap.get(clientId) || {
          nom: inv.client.full_name,
          factureCount: 0,
          montantTotal: 0,
        };
        
        current.factureCount++;
        current.montantTotal += parseFloat(inv.montantTTC) || 0;
        
        const dateFacture = new Date(inv.dateFacture);
        if (!(current as any).dernierDate || dateFacture > new Date((current as any).dernierDate)) {
          (current as any).dernierDate = inv.dateFacture;
        }
        
        clientMap.set(clientId, current);
      }
    });

    return Array.from(clientMap.entries())
      .map(([id, data]) => ({
        id,
        nom: data.nom,
        factureCount: data.factureCount,
        montantTotal: data.montantTotal,
        derniereFacture: data.dernierDate,
      }))
      .sort((a, b) => b.montantTotal - a.montantTotal);
  }

  private getDossiersStats(invoices: any[]): SingleInvoiceTypeStatsDto['dossiers'] {
    const dossierMap = new Map<number, { numero: string; client: string; factureCount: number; montantTotal: number }>();

    invoices.forEach(inv => {
      if (inv.dossier) {
        const dossierId = inv.dossier.id;
        const current = dossierMap.get(dossierId) || {
          numero: inv.dossier.dossier_number,
          client: inv.client?.full_name,
          factureCount: 0,
          montantTotal: 0,
        };
        
        current.factureCount++;
        current.montantTotal += parseFloat(inv.montantTTC) || 0;
        
        dossierMap.set(dossierId, current);
      }
    });

    return Array.from(dossierMap.entries())
      .map(([id, data]) => ({
        id,
        numero: data.numero,
        client: data.client,
        factureCount: data.factureCount,
        montantTotal: data.montantTotal,
      }))
      .sort((a, b) => b.montantTotal - a.montantTotal);
  }

  private getPeriodiciteStats(invoices: any[]): SingleInvoiceTypeStatsDto['periodicite'] {
    const maintenant = new Date();
    const troisAnsAvant = new Date();
    troisAnsAvant.setFullYear(troisAnsAvant.getFullYear() - 3);

    const invoicesFiltrees = invoices.filter(inv => new Date(inv.dateFacture) >= troisAnsAvant);

    // Par mois
    const parMoisMap = new Map<string, number>();
    
    // Par trimestre
    const parTrimestreMap = new Map<string, { count: number; montant: number }>();
    
    // Par année
    const parAnMap = new Map<string, { count: number; montant: number }>();

    invoicesFiltrees.forEach(inv => {
      const date = new Date(inv.dateFacture);
      const mois = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      const trimestre = `${date.getFullYear()}-T${Math.floor(date.getMonth() / 3) + 1}`;
      const annee = date.getFullYear().toString();

      // Par mois
      parMoisMap.set(mois, (parMoisMap.get(mois) || 0) + 1);

      // Par trimestre
      const trimestreCurrent = parTrimestreMap.get(trimestre) || { count: 0, montant: 0 };
      parTrimestreMap.set(trimestre, {
        count: trimestreCurrent.count + 1,
        montant: trimestreCurrent.montant + (parseFloat(inv.montantTTC) || 0),
      });

      // Par année
      const anneeCurrent = parAnMap.get(annee) || { count: 0, montant: 0 };
      parAnMap.set(annee, {
        count: anneeCurrent.count + 1,
        montant: anneeCurrent.montant + (parseFloat(inv.montantTTC) || 0),
      });
    });

    return {
      parMois: Array.from(parMoisMap.entries())
        .map(([mois, count]) => ({ mois, count }))
        .sort((a, b) => a.mois.localeCompare(b.mois)),
      parTrimestre: Array.from(parTrimestreMap.entries())
        .map(([trimestre, data]) => ({ trimestre, count: data.count, montant: data.montant }))
        .sort((a, b) => a.trimestre.localeCompare(b.trimestre)),
      parAn: Array.from(parAnMap.entries())
        .map(([annee, data]) => ({ annee, count: data.count, montant: data.montant }))
        .sort((a, b) => a.annee.localeCompare(b.annee)),
    };
  }

  private getPerformanceStats(invoices: any[]): SingleInvoiceTypeStatsDto['performance'] {
    const total = invoices.length;
    const montantTotal = invoices.reduce((sum, inv) => sum + (parseFloat(inv.montantTTC) || 0), 0);
    const montantPaye = invoices
      .filter(inv => inv.status === StatutFacture.PAYEE)
      .reduce((sum, inv) => sum + (parseFloat(inv.montantTTC) || 0), 0);

    // Montant moyen par facture
    const montantMoyenParFacture = total > 0 ? montantTotal / total : 0;

    // Délai moyen de paiement (pour les factures payées)
    let totalJours = 0;
    let facturesPayees = 0;
    invoices
      .filter(inv => inv.status === StatutFacture.PAYEE && inv.dateFacture && inv.paiements?.length > 0)
      .forEach(inv => {
        const dateFacture = new Date(inv.dateFacture);
        // Prendre la date du premier paiement
        const datePaiement = new Date(inv.paiements[0]?.datePaiement || inv.updated_at);
        const jours = Math.ceil((datePaiement.getTime() - dateFacture.getTime()) / (1000 * 60 * 60 * 24));
        totalJours += jours;
        facturesPayees++;
      });

    const delaiMoyenPaiement = facturesPayees > 0 ? Math.round(totalJours / facturesPayees) : 0;

    // Taux de recouvrement
    const tauxRecouvrement = montantTotal > 0 ? Math.round((montantPaye / montantTotal) * 100) : 0;

    // Factures impayées
    const facturesImpayees = invoices.filter(inv => 
      inv.status !== StatutFacture.PAYEE && 
      inv.status !== StatutFacture.ANNULEE
    ).length;

    const montantImpaye = montantTotal - montantPaye;

    // Top mois
    const parMois = this.getMonthlyEvolution(invoices);
    const topMois = parMois.length > 0 
      ? parMois.reduce((max, current) => current.montant > max.montant ? current : max, parMois[0])
      : { mois: '', montant: 0 };

    return {
      montantMoyenParFacture,
      delaiMoyenPaiement,
      tauxRecouvrement,
      facturesImpayees,
      montantImpaye,
      topMois: { mois: topMois.mois, montant: topMois.montant },
    };
  }

  private getTendancesStats(invoices: any[]): SingleInvoiceTypeStatsDto['tendances'] {
    const maintenant = new Date();
    const cinqAnsAvant = new Date();
    cinqAnsAvant.setFullYear(cinqAnsAvant.getFullYear() - 5);

    const invoicesFiltrees = invoices.filter(inv => new Date(inv.dateFacture) >= cinqAnsAvant);

    // Évolution annuelle avec taux de croissance
    const parAnMap = new Map<string, number>();
    invoicesFiltrees.forEach(inv => {
      const annee = new Date(inv.dateFacture).getFullYear().toString();
      parAnMap.set(annee, (parAnMap.get(annee) || 0) + (parseFloat(inv.montantTTC) || 0));
    });

    const annees = Array.from(parAnMap.entries())
      .map(([annee, montant]) => ({ annee, montant }))
      .sort((a, b) => a.annee.localeCompare(b.annee));

    const evolutionAnnuelle = annees.map((item, index) => {
      let croissance = 0;
      if (index > 0) {
        const precedent = annees[index - 1].montant;
        croissance = precedent > 0 ? Math.round(((item.montant - precedent) / precedent) * 100) : 0;
      }
      return {
        annee: item.annee,
        montant: item.montant,
        croissance,
      };
    });

    // Saisonnalité (moyenne par mois sur toutes les années)
    const moisMap = new Map<number, { total: number; count: number }>();
    for (let i = 1; i <= 12; i++) {
      moisMap.set(i, { total: 0, count: 0 });
    }

    invoicesFiltrees.forEach(inv => {
      const mois = new Date(inv.dateFacture).getMonth() + 1;
      const current = moisMap.get(mois);
      if (current) {
        current.total += parseFloat(inv.montantTTC) || 0;
        current.count++;
        moisMap.set(mois, current);
      }
    });

    const saisonnalite = Array.from(moisMap.entries())
      .map(([mois, data]) => ({
        mois,
        moyenne: data.count > 0 ? data.total / data.count : 0,
      }))
      .sort((a, b) => a.mois - b.mois);

    return {
      evolutionAnnuelle,
      saisonnalite,
    };
  }

  private getMonthlyEvolution(invoices: any[]): Array<{ mois: string; count: number; montant: number }> {
    const evolutionMap = new Map<string, { count: number; montant: number }>();
    const deuxAnsAvant = new Date();
    deuxAnsAvant.setFullYear(deuxAnsAvant.getFullYear() - 2);

    invoices
      .filter(inv => new Date(inv.dateFacture) >= deuxAnsAvant)
      .forEach(inv => {
        const date = new Date(inv.dateFacture);
        const mois = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const current = evolutionMap.get(mois) || { count: 0, montant: 0 };
        evolutionMap.set(mois, {
          count: current.count + 1,
          montant: current.montant + (parseFloat(inv.montantTTC) || 0),
        });
      });

    return Array.from(evolutionMap.entries())
      .map(([mois, data]) => ({ mois, count: data.count, montant: data.montant }))
      .sort((a, b) => a.mois.localeCompare(b.mois));
  }

  private getCategoryLabel(category: InvoiceTypeCategory): string {
    const labels = {
      [InvoiceTypeCategory.LEGAL_FEES]: 'Honoraires',
      [InvoiceTypeCategory.EXPENSES]: 'Frais',
      [InvoiceTypeCategory.ADVANCE]: 'Provision',
      [InvoiceTypeCategory.SETTLEMENT]: 'Règlement',
      [InvoiceTypeCategory.OTHER]: 'Autre',
    };
    return labels[category] || category;
  }

  // Méthode existante pour les stats globales
  private async getGlobalStats(): Promise<InvoiceTypeStatsDto> {
    const [total, active, inactive] = await Promise.all([
      this.getTotalCount(),
      this.getActiveCount(),
      this.getInactiveCount(),
    ]);

    const [byCategory, byTaxRate, topInvoiceTypes, usageStats] = await Promise.all([
      this.getStatsByCategory(),
      this.getStatsByTaxRate(),
      this.getTopInvoiceTypes(),
      this.getUsageStats(),
    ]);

    return {
      total,
      active,
      inactive,
      byCategory,
      byTaxRate,
      topInvoiceTypes,
      usageStats,
    };
  }

  private async getTotalCount(): Promise<number> {
    return this.invoiceTypeRepository.count();
  }

  private async getActiveCount(): Promise<number> {
    return this.invoiceTypeRepository.count({ where: { is_active: true } });
  }

  private async getInactiveCount(): Promise<number> {
    return this.invoiceTypeRepository.count({ where: { is_active: false } });
  }

  private async getStatsByCategory(): Promise<InvoiceTypeCategoryStatsDto[]> {
    const invoiceTypes = await this.invoiceTypeRepository.find({
      relations: ['invoices'],
    });

    const categories = Object.values(InvoiceTypeCategory);
    const total = invoiceTypes.length;

    const categoryColors: Record<InvoiceTypeCategory, string> = {
      [InvoiceTypeCategory.LEGAL_FEES]: '#3b82f6',
      [InvoiceTypeCategory.EXPENSES]: '#f59e0b',
      [InvoiceTypeCategory.ADVANCE]: '#10b981',
      [InvoiceTypeCategory.SETTLEMENT]: '#8b5cf6',
      [InvoiceTypeCategory.OTHER]: '#6b7280',
    };

    const categoryLabels: Record<InvoiceTypeCategory, string> = {
      [InvoiceTypeCategory.LEGAL_FEES]: 'Honoraires',
      [InvoiceTypeCategory.EXPENSES]: 'Frais',
      [InvoiceTypeCategory.ADVANCE]: 'Provision',
      [InvoiceTypeCategory.SETTLEMENT]: 'Règlement',
      [InvoiceTypeCategory.OTHER]: 'Autre',
    };

    const stats = categories.map(category => {
      const typesInCategory = invoiceTypes.filter(t => t.category === category);
      const count = typesInCategory.length;

      return {
        category: categoryLabels[category],
        code: category,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
        color: categoryColors[category],
      };
    });

    return stats.filter(s => s.count > 0);
  }

  private async getStatsByTaxRate(): Promise<InvoiceTypeTaxRateStatsDto[]> {
    const invoiceTypes = await this.invoiceTypeRepository.find({
      relations: ['invoices'],
    });

    const taxRates = Object.values(TaxRate).filter(value => typeof value === 'number') as number[];
    const total = invoiceTypes.length;

    const stats = await Promise.all(taxRates.map(async rate => {
      const typesWithRate = invoiceTypes.filter(t => t.default_tax_rate === rate);
      const count = typesWithRate.length;

      let totalInvoices = 0;
      let totalAmount = 0;

      typesWithRate.forEach(type => {
        if (type.invoices) {
          totalInvoices += type.invoices.length;
          totalAmount += type.invoices.reduce((sum, inv) => sum + Number(inv.montantTTC || 0), 0);
        }
      });

      return {
        taxRate: rate,
        count,
        percentage: total > 0 ? Math.round((count / total) * 100) : 0,
        totalInvoices,
        totalAmount: Math.round(totalAmount * 100) / 100,
      };
    }));

    return stats.filter(s => s.count > 0);
  }

  private async getTopInvoiceTypes(): Promise<TopInvoiceTypeDto[]> {
    const invoiceTypes = await this.invoiceTypeRepository
      .createQueryBuilder('it')
      .leftJoinAndSelect('it.invoices', 'invoices')
      .select('it.id', 'id')
      .addSelect('it.code', 'code')
      .addSelect('it.name', 'name')
      .addSelect('it.category', 'category')
      .addSelect('it.is_active', 'isActive')
      .addSelect('COUNT(invoices.id)', 'invoicesCount')
      .addSelect('SUM(invoices.montantTTC)', 'totalAmount')
      .groupBy('it.id')
      .orderBy('invoicesCount', 'DESC')
      .limit(10)
      .getRawMany();

    const categoryLabels: Record<InvoiceTypeCategory, string> = {
      [InvoiceTypeCategory.LEGAL_FEES]: 'Honoraires',
      [InvoiceTypeCategory.EXPENSES]: 'Frais',
      [InvoiceTypeCategory.ADVANCE]: 'Provision',
      [InvoiceTypeCategory.SETTLEMENT]: 'Règlement',
      [InvoiceTypeCategory.OTHER]: 'Autre',
    };

    return invoiceTypes.map(t => ({
      id: t.id,
      code: t.code,
      name: t.name,
      category: categoryLabels[t.category] || t.category,
      invoicesCount: parseInt(t.invoicesCount || 0),
      totalAmount: parseFloat(t.totalAmount || 0),
      isActive: t.isActive === 1,
    }));
  }

  private async getUsageStats(): Promise<InvoiceTypeUsageStatsDto> {
    const invoiceTypes = await this.invoiceTypeRepository.find({
      relations: ['invoices'],
    });

    let totalInvoices = 0;
    let totalAmount = 0;
    const typeStats: Record<number, { count: number; amount: number; name: string }> = {};

    invoiceTypes.forEach(type => {
      if (type.invoices) {
        const typeTotal = type.invoices.reduce((sum, inv) => sum + Number(inv.montantTTC || 0), 0);
        totalInvoices += type.invoices.length;
        totalAmount += typeTotal;

        typeStats[type.id] = {
          count: type.invoices.length,
          amount: typeTotal,
          name: type.name,
        };
      }
    });

    let mostUsedType = { id: 0, name: '', count: 0, amount: 0 };
    let highestValueType = { id: 0, name: '', count: 0, amount: 0 };

    Object.entries(typeStats).forEach(([id, stats]) => {
      if (stats.count > mostUsedType.count) {
        mostUsedType = { id: parseInt(id), ...stats };
      }
      if (stats.amount > highestValueType.amount) {
        highestValueType = { id: parseInt(id), ...stats };
      }
    });

    return {
      totalInvoices,
      totalAmount: Math.round(totalAmount * 100) / 100,
      averagePerType: invoiceTypes.length > 0 ? Math.round((totalAmount / invoiceTypes.length) * 100) / 100 : 0,
      mostUsedType,
      highestValueType,
    };
  }
}