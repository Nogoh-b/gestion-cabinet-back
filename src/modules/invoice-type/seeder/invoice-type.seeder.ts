import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';

import { InvoiceType, InvoiceTypeCategory, TaxRate } from '../entities/invoice-type.entity';


export default class InvoiceTypeSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    factoryManager: SeederFactoryManager
  ): Promise<any> {
    const repository = dataSource.getRepository(InvoiceType);

    const invoiceTypes = [
      {
        code: 'HON_CONSULTATION',
        name: 'Honoraires de Consultation',
        description: 'Consultation juridique initiale',
        category: InvoiceTypeCategory.LEGAL_FEES,
        default_tax_rate: TaxRate.STANDARD,
        is_billable: true,
        requires_approval: false,
        default_payment_days: 30,
        is_active: true,
        metadata: {
          accounting_code: '706100',
          default_unit: 'hour' as const, // <-- Correction ici
          default_price: 50000,
          vat_exempt: false,
          legal_basis: 'Barème des honoraires recommandés par l\'ONBC'
        }
      },
      {
        code: 'HON_PROCEDURE',
        name: 'Honoraires de Procédure',
        description: 'Honoraires pour suivi de procédure',
        category: InvoiceTypeCategory.LEGAL_FEES,
        default_tax_rate: TaxRate.STANDARD,
        is_billable: true,
        requires_approval: true,
        default_payment_days: 30,
        is_active: true,
        metadata: {
          accounting_code: '706200',
          default_unit: 'fixed' as const,
          default_price: 150000,
          vat_exempt: false
        }
      },
      {
        code: 'HON_PLAIDOIRIE',
        name: 'Honoraires de Plaidoirie',
        description: 'Plaidoirie devant le tribunal',
        category: InvoiceTypeCategory.LEGAL_FEES,
        default_tax_rate: TaxRate.STANDARD,
        is_billable: true,
        requires_approval: true,
        default_payment_days: 30,
        is_active: true,
        metadata: {
          accounting_code: '706300',
          default_unit: 'day' as const,
          default_price: 250000,
          vat_exempt: false
        }
      },
      {
        code: 'FRAIS_DOSSIER',
        name: 'Frais de Dossier',
        description: 'Frais d\'ouverture et de gestion de dossier',
        category: InvoiceTypeCategory.EXPENSES,
        default_tax_rate: TaxRate.STANDARD,
        is_billable: true,
        requires_approval: false,
        default_payment_days: 30,
        is_active: true,
        metadata: {
          accounting_code: '622100',
          default_unit: 'fixed' as const,
          default_price: 25000,
          vat_exempt: false
        }
      },
      {
        code: 'FRAIS_DEPLACEMENT',
        name: 'Frais de Déplacement',
        description: 'Frais de déplacement pour audiences',
        category: InvoiceTypeCategory.EXPENSES,
        default_tax_rate: TaxRate.ZERO,
        is_billable: true,
        requires_approval: true,
        default_payment_days: 30,
        is_active: true,
        metadata: {
          accounting_code: '625100',
          default_unit: 'unit' as const,
          default_price: 0,
          vat_exempt: true
        }
      },
      {
        code: 'FRAIS_COURRIER',
        name: 'Frais de Courrier',
        description: 'Affranchissement et envois courriers',
        category: InvoiceTypeCategory.EXPENSES,
        default_tax_rate: TaxRate.STANDARD,
        is_billable: true,
        requires_approval: false,
        default_payment_days: 30,
        is_active: true,
        metadata: {
          accounting_code: '622200',
          default_unit: 'unit' as const,
          default_price: 5000,
          vat_exempt: false
        }
      },
      {
        code: 'FRAIS_EXPERTISE',
        name: 'Frais d\'Expertise',
        description: 'Rémunération des experts',
        category: InvoiceTypeCategory.EXPENSES,
        default_tax_rate: TaxRate.STANDARD,
        is_billable: true,
        requires_approval: true,
        default_payment_days: 30,
        is_active: true,
        metadata: {
          accounting_code: '622300',
          default_unit: 'fixed' as const,
          default_price: 0,
          vat_exempt: false
        }
      },
      {
        code: 'ACOMPTE',
        name: 'Acompte sur Honoraires',
        description: 'Acompte versé au début de la mission',
        category: InvoiceTypeCategory.ADVANCE,
        default_tax_rate: TaxRate.STANDARD,
        is_billable: true,
        requires_approval: false,
        default_payment_days: 15,
        is_active: true,
        metadata: {
          accounting_code: '419100',
          default_unit: 'fixed' as const,
          default_price: 0,
          vat_exempt: false
        }
      },
      {
        code: 'REGLEMENT_SOLDE',
        name: 'Règlement du Solde',
        description: 'Règlement final des honoraires',
        category: InvoiceTypeCategory.SETTLEMENT,
        default_tax_rate: TaxRate.STANDARD,
        is_billable: true,
        requires_approval: true,
        default_payment_days: 30,
        is_active: true,
        metadata: {
          accounting_code: '411100',
          default_unit: 'fixed' as const,
          default_price: 0,
          vat_exempt: false
        }
      },
      {
        code: 'FRAIS_TIMBRES',
        name: 'Frais de Timbre',
        description: 'Timbre fiscal pour actes juridiques',
        category: InvoiceTypeCategory.EXPENSES,
        default_tax_rate: TaxRate.ZERO,
        is_billable: true,
        requires_approval: false,
        default_payment_days: 30,
        is_active: true,
        metadata: {
          accounting_code: '622400',
          default_unit: 'unit' as const,
          default_price: 1000,
          vat_exempt: true
        }
      },
      {
        code: 'HON_REDACTION',
        name: 'Honoraires de Rédaction',
        description: 'Rédaction d\'actes, contrats, conclusions',
        category: InvoiceTypeCategory.LEGAL_FEES,
        default_tax_rate: TaxRate.STANDARD,
        is_billable: true,
        requires_approval: false,
        default_payment_days: 30,
        is_active: true,
        metadata: {
          accounting_code: '706400',
          default_unit: 'hour' as const,
          default_price: 35000,
          vat_exempt: false
        }
      },
      {
        code: 'FRAIS_PUBLICATION',
        name: 'Frais de Publication',
        description: 'Publication dans journaux officiels',
        category: InvoiceTypeCategory.EXPENSES,
        default_tax_rate: TaxRate.STANDARD,
        is_billable: true,
        requires_approval: true,
        default_payment_days: 30,
        is_active: true,
        metadata: {
          accounting_code: '622500',
          default_unit: 'unit' as const,
          default_price: 15000,
          vat_exempt: false
        }
      },
      {
        code: 'HON_NEGOCIATION',
        name: 'Honoraires de Négociation',
        description: 'Négociation amiable, médiation',
        category: InvoiceTypeCategory.LEGAL_FEES,
        default_tax_rate: TaxRate.STANDARD,
        is_billable: true,
        requires_approval: true,
        default_payment_days: 30,
        is_active: true,
        metadata: {
          accounting_code: '706500',
          default_unit: 'hour' as const,
          default_price: 45000,
          vat_exempt: false
        }
      },
      {
        code: 'FRAIS_HUISSIER',
        name: 'Frais d\'Huissier',
        description: 'Signification d\'actes par huissier',
        category: InvoiceTypeCategory.EXPENSES,
        default_tax_rate: TaxRate.STANDARD,
        is_billable: true,
        requires_approval: true,
        default_payment_days: 30,
        is_active: true,
        metadata: {
          accounting_code: '622600',
          default_unit: 'unit' as const,
          default_price: 20000,
          vat_exempt: false
        }
      },
      {
        code: 'AUTRES_FRAIS',
        name: 'Autres Frais',
        description: 'Frais divers non catégorisés',
        category: InvoiceTypeCategory.OTHER,
        default_tax_rate: TaxRate.STANDARD,
        is_billable: true,
        requires_approval: true,
        default_payment_days: 30,
        is_active: true,
        metadata: {
          accounting_code: '622700',
          default_unit: 'unit' as const,
          default_price: 0,
          vat_exempt: false
        }
      }
    ];

    for (const typeData of invoiceTypes) {
      const existing = await repository.findOne({
        where: { code: typeData.code }
      });

      if (!existing) {
        const invoiceType = repository.create(typeData);
        await repository.save(invoiceType);
        console.log(`Type de facture créé: ${invoiceType.name}`);
      }
    }
  }
}