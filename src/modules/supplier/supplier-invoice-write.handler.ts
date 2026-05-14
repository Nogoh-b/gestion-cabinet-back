// src/modules/supplier/supplier-invoice-write.handler.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { SupplierInvoice, SupplierInvoiceStatus, PaymentMethod } from './entities/supplier-invoice.entity';
import { BaseWriteHandler } from 'src/core/ai-database/write/base-write-handler';
import { SchemaMetadataService } from 'src/core/ai-database/schema-metadata.service';
import { EntityResolverService } from 'src/core/ai-database/write/entity-resolver.service';
import { WriteResult } from 'src/core/ai-database/write/write-handler.registry';
import { WriteableFieldSchema, ValidationResult } from 'src/core/ai-database/interface/entity-write-handler.interface';

/**
 * Handler custom pour les factures fournisseurs.
 * Logique métier :
 *   - Fournisseur obligatoire (FK)
 *   - invoice_number reste celui du fournisseur (non auto-généré) → conservé
 *   - Calcul automatique TVA / TTC à partir de HT + tax_rate
 *   - Status par défaut : RECEIVED
 *   - Date d'échéance par défaut : J+30
 */
@Injectable()
export class SupplierInvoiceWriteHandler extends BaseWriteHandler {
  constructor(
    dataSource: DataSource,
    schemaMetadata: SchemaMetadataService,
    entityResolver: EntityResolverService,
    @InjectRepository(SupplierInvoice)
    private readonly invoiceRepo: Repository<SupplierInvoice>,
  ) {
    super('supplier_invoice', dataSource, schemaMetadata, entityResolver);
  }

  // ── Schema enrichi ─────────────────────────────────────────────────────────

  async getWriteableFieldsSchema(): Promise<WriteableFieldSchema[]> {
    const fields = await super.getWriteableFieldsSchema();
    const enrichments: Record<string, Partial<WriteableFieldSchema>> = {
      supplier_id: {
        description: 'ID du fournisseur. Peut aussi fournir "supplier" avec son nom.',
        example: '5',
        required: true,
      },
      invoice_number: {
        description: 'Numéro de facture du fournisseur (tel quel, pas généré)',
        example: 'FAC-2026-0452',
        required: true,
      },
      amount_ht: {
        description: 'Montant hors taxes (obligatoire pour calcul TVA/TTC)',
        example: '150.00',
        required: true,
      },
      tax_rate: {
        description: 'Taux de TVA en %, ex: 20.00',
        example: '20.00',
      },
      status: {
        description: 'received, approved, paid, cancelled, disputed',
        example: 'received',
      },
      payment_method: {
        description: 'ESPECES, CHEQUE, VIREMENT, CARTE_BANCAIRE, PRELEVEMENT, MOBILE_MONEY',
        example: 'VIREMENT',
      },
    };
    for (const f of fields) {
      if (enrichments[f.name]) Object.assign(f, enrichments[f.name]);
    }
    return fields;
  }

  // ── Validation métier ──────────────────────────────────────────────────────

  async validateFields(
    fields: Record<string, any>,
    operation: 'INSERT' | 'UPDATE',
  ): Promise<ValidationResult> {
    const errors: string[] = [];

    if (operation === 'INSERT') {
      if (!fields.supplier_id) errors.push('Le fournisseur est requis (supplier_id ou supplier)');
      if (!fields.invoice_number) errors.push('Le numéro de facture fournisseur est requis (invoice_number)');
      if (fields.amount_ht === undefined || fields.amount_ht === null) {
        errors.push('Le montant HT est requis (amount_ht)');
      } else if (Number(fields.amount_ht) <= 0) {
        errors.push('Le montant HT doit être strictement positif');
      }
    } else if (operation === 'UPDATE') {
      if (fields.amount_ht !== undefined && Number(fields.amount_ht) <= 0) {
        errors.push('Le montant HT doit être strictement positif');
      }
    }

    return { valid: errors.length === 0, errors, transformedFields: fields };
  }

  // ── INSERT : calculs + valeurs par défaut + dedup par (supplier+invoice_number) ──

  protected async doInsert(fields: Record<string, any>, userId: string): Promise<WriteResult> {
    // NB: invoice_number est dans AUTO_GENERATED_FIELDS via "code" / "reference" ? Non,
    // c'est invoice_number — pas générique. On ne le strip PAS pour cette entité.
    const safeFields = this.filterKnownColumns(fields);

    // Dédup spécifique : même (supplier_id, invoice_number) → doublon
    if (safeFields.supplier_id && safeFields.invoice_number) {
      const existing = await this.invoiceRepo.findOne({
        where: {
          supplier_id: safeFields.supplier_id,
          invoice_number: safeFields.invoice_number,
        },
      });
      if (existing) {
        this.logger.warn(
          `♻️  Facture fournisseur déjà existante: ${existing.invoice_number} pour supplier ${existing.supplier_id}`,
        );
        return {
          success: true,
          operation: 'INSERT',
          entityId: existing.id,
          affected: 0,
          data: existing,
          message: `Facture fournisseur ${existing.invoice_number} déjà existante (ID: ${existing.id})`,
        };
      }
    }

    // Calculs
    const amountHT = Number(safeFields.amount_ht);
    const taxRate = Number(safeFields.tax_rate ?? 0);
    const amountTVA = Math.round(amountHT * taxRate) / 100;
    const amountTTC = Math.round((amountHT + amountTVA) * 100) / 100;

    // Dates par défaut
    const invoiceDate = safeFields.invoice_date ? new Date(safeFields.invoice_date) : new Date();
    const dueDate = safeFields.due_date
      ? new Date(safeFields.due_date)
      : new Date(invoiceDate.getTime() + 30 * 24 * 60 * 60 * 1000);

    const data = {
      ...safeFields,
      invoice_date: invoiceDate,
      due_date: dueDate,
      amount_ht: amountHT,
      tax_rate: taxRate,
      amount_tva: amountTVA,
      amount_ttc: amountTTC,
      status: safeFields.status ?? SupplierInvoiceStatus.RECEIVED,
      created_by_id: userId ? Number(userId) : undefined,
    } as any;

    const record = this.invoiceRepo.create(data);
    const saved = await this.invoiceRepo.save(record) as unknown as SupplierInvoice;

    return {
      success: true,
      operation: 'INSERT',
      entityId: saved.id,
      affected: 1,
      data: saved,
      message: `Facture fournisseur ${saved.invoice_number} enregistrée (TTC: ${amountTTC.toFixed(2)} €)`,
    };
  }

  // ── UPDATE : recalculs + transition de status ─────────────────────────────

  protected async doUpdate(
    entityId: string | number,
    fields: Record<string, any>,
    userId: string,
  ): Promise<WriteResult> {
    const invoice = await this.invoiceRepo.findOne({ where: { id: entityId as any } });
    if (!invoice) throw new NotFoundException(`Facture fournisseur ${entityId} introuvable`);

    const safeFields = this.filterKnownColumns(fields);
    Object.assign(invoice, safeFields);

    // Recalcul TVA/TTC si modifs financières
    if (safeFields.amount_ht !== undefined || safeFields.tax_rate !== undefined) {
      invoice.amount_ht = Number(invoice.amount_ht);
      invoice.tax_rate = Number(invoice.tax_rate);
      invoice.amount_tva = Math.round(invoice.amount_ht * invoice.tax_rate) / 100;
      invoice.amount_ttc = Math.round((invoice.amount_ht + invoice.amount_tva) * 100) / 100;
    }

    // Si on passe à PAID sans payment_date → la mettre à aujourd'hui
    if (
      safeFields.status === SupplierInvoiceStatus.PAID &&
      !invoice.payment_date
    ) {
      invoice.payment_date = new Date();
    }

    const saved = await this.invoiceRepo.save(invoice);
    return {
      success: true,
      operation: 'UPDATE',
      entityId: saved.id,
      affected: 1,
      data: saved,
      message: `Facture fournisseur ${saved.invoice_number} mise à jour`,
    };
  }
}
