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

@Injectable()
export class InvoiceTypeStatsService {
  constructor(
    @InjectRepository(InvoiceType)
    private invoiceTypeRepository: Repository<InvoiceType>,
  ) {}

  async getStats(): Promise<InvoiceTypeStatsDto> {
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
      [InvoiceTypeCategory.LEGAL_FEES]: '#3b82f6', // bleu
      [InvoiceTypeCategory.EXPENSES]: '#f59e0b',   // orange
      [InvoiceTypeCategory.ADVANCE]: '#10b981',    // vert
      [InvoiceTypeCategory.SETTLEMENT]: '#8b5cf6', // violet
      [InvoiceTypeCategory.OTHER]: '#6b7280',      // gris
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

      // Calculer le total des factures pour ce taux
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

    // Trouver le type le plus utilisé
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