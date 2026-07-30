import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { generateEntityCode } from 'src/core/shared/utils/code.util';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import {
  BaseServiceV1,
  SearchOptions,
} from 'src/core/shared/services/search/base-v1.service';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { AuditService } from 'src/core/audit/audit.service';
import { OutboxService } from 'src/core/outbox/outbox.service';
import { CreateSupplierInvoiceDto } from './dto/create-supplier-invoice.dto';
import { UpdateSupplierInvoiceDto } from './dto/update-supplier-invoice.dto';
import { PaySupplierInvoiceDto } from './dto/pay-supplier-invoice.dto';
import { Supplier } from './entities/supplier.entity';
import {
  SupplierInvoice,
  SupplierInvoiceStatus,
} from './entities/supplier-invoice.entity';
import { Branch } from '../agencies/branch/entities/branch.entity';
import { SupplierEvidenceStorageService } from './supplier-evidence-storage.service';

export interface SupplierInvoiceActor {
  userId?: number | null;
}

export interface PrivateSupplierEvidence {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  sha256: string;
}

@Injectable()
export class SupplierInvoicesService extends BaseServiceV1<SupplierInvoice> {
  constructor(
    protected readonly paginationService: PaginationServiceV1,
    @InjectRepository(SupplierInvoice)
    protected repository: Repository<SupplierInvoice>,
    @InjectRepository(Supplier)
    private readonly supplierRepo: Repository<Supplier>,
    @InjectRepository(Branch)
    private readonly branchRepo: Repository<Branch>,
    private readonly dataSource: DataSource,
    private readonly outboxService: OutboxService,
    private readonly auditService: AuditService,
    private readonly evidenceStorage: SupplierEvidenceStorageService,
  ) {
    super(repository, paginationService);
  }

  protected getDefaultSearchOptions(): SearchOptions {
    return {
      searchFields: ['invoice_number', 'description', 'notes'],
      exactMatchFields: ['id', 'supplier_id', 'branch_id', 'status'],
      dateRangeFields: ['invoice_date', 'due_date', 'payment_date'],
      relationFields: ['supplier', 'branch', 'created_by'],
    };
  }

  async create(
    dto: CreateSupplierInvoiceDto,
    actor: SupplierInvoiceActor = {},
  ): Promise<SupplierInvoice> {
    this.assertAmounts(dto);
    this.assertDates(dto.invoice_date, dto.due_date);
    const supplier = await this.supplierRepo.findOne({
      where: {
        id: dto.supplier_id,
        tenant_id: getCurrentTenantId(),
      },
    });
    if (!supplier) throw new NotFoundException('Fournisseur non trouvé');

    let branch: Branch | null = null;
    if (dto.branch_id) {
      branch = await this.branchRepo.findOne({
        where: {
          id: dto.branch_id,
          tenant_id: getCurrentTenantId(),
        },
      });
      if (!branch) throw new NotFoundException('Agence non trouvée');
    }

    const entity = this.repository.create();
    Object.assign(entity, {
      ...dto,
      invoice_number:
        dto.invoice_number?.trim() || generateEntityCode('FF'),
      invoice_date: new Date(dto.invoice_date),
      due_date: new Date(dto.due_date),
      description: dto.description?.trim() || null,
      notes: dto.notes?.trim() || null,
      supplier,
      supplier_id: supplier.id,
      branch,
      branch_id: branch?.id ?? null,
      status: SupplierInvoiceStatus.RECEIVED,
      created_by_id: actor.userId ?? null,
      attachment_url: null,
      approved_by_id: null,
      approved_at: null,
      paid_by_id: null,
      payment_date: null,
      payment_method: null,
      payment_reference: null,
      tenant_id: getCurrentTenantId(),
    });
    return this.repository.save(entity);
  }

  findAll(): Promise<SupplierInvoice[]> {
    return this.repository.find({
      where: { tenant_id: getCurrentTenantId() },
      relations: [
        'supplier',
        'branch',
        'created_by',
        'approved_by',
        'paid_by',
      ],
      order: { invoice_date: 'DESC' },
    });
  }

  async findOne(id: number): Promise<SupplierInvoice> {
    const invoice = await this.repository.findOne({
      where: { id, tenant_id: getCurrentTenantId() },
      relations: [
        'supplier',
        'branch',
        'created_by',
        'approved_by',
        'paid_by',
      ],
    });
    if (!invoice) {
      throw new NotFoundException('Facture fournisseur non trouvée');
    }
    return invoice;
  }

  findBySupplier(supplierId: number): Promise<SupplierInvoice[]> {
    return this.repository.find({
      where: {
        supplier_id: supplierId,
        tenant_id: getCurrentTenantId(),
      },
      relations: ['supplier'],
      order: { invoice_date: 'DESC' },
    });
  }

  async update(
    id: number,
    dto: UpdateSupplierInvoiceDto,
  ): Promise<SupplierInvoice> {
    const invoice = await this.findOne(id);
    if (invoice.status !== SupplierInvoiceStatus.RECEIVED) {
      throw new BadRequestException(
        'Seule une facture fournisseur reçue peut être modifiée',
      );
    }
    const merged = {
      amount_ht: dto.amount_ht ?? Number(invoice.amount_ht),
      amount_tva: dto.amount_tva ?? Number(invoice.amount_tva),
      amount_ttc: dto.amount_ttc ?? Number(invoice.amount_ttc),
      tax_rate: dto.tax_rate ?? Number(invoice.tax_rate),
    };
    this.assertAmounts(merged);
    this.assertDates(
      dto.invoice_date ?? invoice.invoice_date.toISOString(),
      dto.due_date ?? invoice.due_date.toISOString(),
    );

    let supplier = invoice.supplier;
    if (dto.supplier_id && dto.supplier_id !== invoice.supplier_id) {
      const resolvedSupplier = await this.supplierRepo.findOne({
        where: {
          id: dto.supplier_id,
          tenant_id: getCurrentTenantId(),
        },
      });
      if (!resolvedSupplier) {
        throw new NotFoundException('Fournisseur non trouvé');
      }
      supplier = resolvedSupplier;
    }
    let branch = invoice.branch;
    if (dto.branch_id && dto.branch_id !== invoice.branch_id) {
      const resolvedBranch = await this.branchRepo.findOne({
        where: {
          id: dto.branch_id,
          tenant_id: getCurrentTenantId(),
        },
      });
      if (!resolvedBranch) {
        throw new NotFoundException('Agence non trouvée');
      }
      branch = resolvedBranch;
    }

    Object.assign(invoice, {
      ...dto,
      invoice_date: dto.invoice_date
        ? new Date(dto.invoice_date)
        : invoice.invoice_date,
      due_date: dto.due_date ? new Date(dto.due_date) : invoice.due_date,
      invoice_number:
        dto.invoice_number?.trim() || invoice.invoice_number,
      description:
        dto.description === undefined
          ? invoice.description
          : dto.description.trim() || null,
      notes:
        dto.notes === undefined
          ? invoice.notes
          : dto.notes.trim() || null,
      supplier,
      supplier_id: supplier.id,
      branch,
      branch_id: branch?.id ?? null,
      status: invoice.status,
      created_by_id: invoice.created_by_id,
      tenant_id: invoice.tenant_id,
    });
    return this.repository.save(invoice);
  }

  async approve(
    id: number,
    actor: SupplierInvoiceActor,
  ): Promise<SupplierInvoice> {
    const actorId = this.requireActor(actor);
    return this.dataSource.transaction(async (manager) => {
      const invoice = await this.lockInvoice(manager, id);
      if (invoice.status !== SupplierInvoiceStatus.RECEIVED) {
        throw new BadRequestException(
          'Seule une facture fournisseur reçue peut être approuvée',
        );
      }
      if (invoice.created_by_id === actorId) {
        throw new ForbiddenException(
          'L’auteur de la facture ne peut pas l’approuver lui-même',
        );
      }
      invoice.status = SupplierInvoiceStatus.APPROVED;
      invoice.approved_by_id = actorId;
      invoice.approved_at = new Date();
      const saved = await manager
        .getRepository(SupplierInvoice)
        .save(invoice);
      const audit = await this.auditService.append(manager, {
        actorId,
        action: 'supplier_invoice.approved',
        resourceType: 'supplier_invoice',
        resourceId: saved.id,
        beforeState: { status: SupplierInvoiceStatus.RECEIVED },
        afterState: {
          status: saved.status,
          approvedAt: saved.approved_at,
        },
      });
      await this.outboxService.enqueue(manager, {
        eventType: 'supplier_invoice.approved',
        aggregateType: 'supplier_invoice',
        aggregateId: saved.id,
        idempotencyKey: `supplier-invoice-approved:${audit.id}`,
        payload: this.eventPayload(saved),
      });
      return saved;
    });
  }

  async markAsPaid(
    id: number,
    dto: PaySupplierInvoiceDto,
    actor: SupplierInvoiceActor,
  ): Promise<SupplierInvoice> {
    const actorId = this.requireActor(actor);
    const paymentDate = dto.paymentDate
      ? new Date(dto.paymentDate)
      : new Date();
    if (
      Number.isNaN(paymentDate.getTime()) ||
      paymentDate.getTime() > Date.now() + 60_000
    ) {
      throw new BadRequestException('Date de paiement invalide');
    }
    return this.dataSource.transaction(async (manager) => {
      const invoice = await this.lockInvoice(manager, id);
      if (invoice.status !== SupplierInvoiceStatus.APPROVED) {
        throw new BadRequestException(
          'Seule une facture fournisseur approuvée peut être payée',
        );
      }
      invoice.status = SupplierInvoiceStatus.PAID;
      invoice.payment_date = paymentDate;
      invoice.payment_method = dto.paymentMethod;
      invoice.payment_reference = dto.paymentReference.trim();
      invoice.paid_by_id = actorId;
      const saved = await manager
        .getRepository(SupplierInvoice)
        .save(invoice);
      const audit = await this.auditService.append(manager, {
        actorId,
        action: 'supplier_invoice.paid',
        resourceType: 'supplier_invoice',
        resourceId: saved.id,
        beforeState: { status: SupplierInvoiceStatus.APPROVED },
        afterState: {
          status: saved.status,
          paymentDate: saved.payment_date,
          paymentMethod: saved.payment_method,
          paymentReference: saved.payment_reference,
        },
      });
      await this.outboxService.enqueue(manager, {
        eventType: 'supplier_invoice.paid',
        aggregateType: 'supplier_invoice',
        aggregateId: saved.id,
        idempotencyKey: `supplier-invoice-paid:${audit.id}`,
        payload: this.eventPayload(saved),
      });
      return saved;
    });
  }

  async remove(): Promise<never> {
    throw new BadRequestException(
      'La suppression physique d’une facture fournisseur est interdite',
    );
  }

  async attachEvidence(
    id: number,
    file: Express.Multer.File,
    actor: SupplierInvoiceActor,
  ): Promise<SupplierInvoice> {
    const actorId = this.requireActor(actor);
    const stored = await this.evidenceStorage.store(file, 'invoice');
    let previousStorageKey: string | null = null;
    try {
      const saved = await this.dataSource.transaction(async (manager) => {
        const invoice = await this.lockInvoice(manager, id);
        if (invoice.status !== SupplierInvoiceStatus.RECEIVED) {
          throw new BadRequestException(
            'Le justificatif est verrouillé après approbation',
          );
        }
        previousStorageKey = invoice.attachment_url;
        Object.assign(invoice, {
          attachment_url: stored.storageKey,
          attachment_original_name: stored.originalName,
          attachment_mime_type: stored.mimeType,
          attachment_size: String(stored.size),
          attachment_sha256: stored.sha256,
        });
        const result = await manager
          .getRepository(SupplierInvoice)
          .save(invoice);
        await this.auditService.append(manager, {
          actorId,
          action: 'supplier_invoice.evidence.attached',
          resourceType: 'supplier_invoice',
          resourceId: result.id,
          afterState: {
            filename: stored.originalName,
            mimeType: stored.mimeType,
            size: stored.size,
            sha256: stored.sha256,
          },
        });
        return result;
      });
      if (previousStorageKey && previousStorageKey !== stored.storageKey) {
        await this.evidenceStorage.remove(previousStorageKey);
      }
      return saved;
    } catch (error) {
      await this.evidenceStorage.remove(stored.storageKey);
      throw error;
    }
  }

  async getEvidence(
    id: number,
    actor: SupplierInvoiceActor,
  ): Promise<PrivateSupplierEvidence> {
    const actorId = this.requireActor(actor);
    const invoice = await this.findOne(id);
    if (
      !invoice.attachment_url ||
      !invoice.attachment_original_name ||
      !invoice.attachment_mime_type ||
      !invoice.attachment_sha256
    ) {
      throw new NotFoundException('Justificatif fournisseur absent');
    }
    const buffer = await this.evidenceStorage.read(invoice.attachment_url);
    await this.dataSource.transaction((manager) =>
      this.auditService.append(manager, {
        actorId,
        action: 'supplier_invoice.evidence.downloaded',
        resourceType: 'supplier_invoice',
        resourceId: invoice.id,
        afterState: { sha256: invoice.attachment_sha256 },
      }),
    );
    return {
      buffer,
      filename: invoice.attachment_original_name,
      mimeType: invoice.attachment_mime_type,
      sha256: invoice.attachment_sha256,
    };
  }

  private async lockInvoice(
    manager: EntityManager,
    id: number,
  ): Promise<SupplierInvoice> {
    const invoice = await manager.getRepository(SupplierInvoice).findOne({
      where: { id, tenant_id: getCurrentTenantId() },
      relations: ['supplier'],
      lock: { mode: 'pessimistic_write' },
    });
    if (!invoice) {
      throw new NotFoundException('Facture fournisseur non trouvée');
    }
    return invoice;
  }

  private requireActor(actor: SupplierInvoiceActor): number {
    const actorId = Number(actor?.userId);
    if (!Number.isInteger(actorId) || actorId <= 0) {
      throw new ForbiddenException('Acteur authentifié obligatoire');
    }
    return actorId;
  }

  private assertDates(invoiceDate: string, dueDate: string): void {
    const invoice = new Date(invoiceDate);
    const due = new Date(dueDate);
    if (
      Number.isNaN(invoice.getTime()) ||
      Number.isNaN(due.getTime()) ||
      due.getTime() < invoice.getTime()
    ) {
      throw new BadRequestException(
        'La date d’échéance doit être postérieure à la date de facture',
      );
    }
  }

  private assertAmounts(input: {
    amount_ht: number;
    amount_tva: number;
    amount_ttc: number;
    tax_rate: number;
  }): void {
    const ht = this.toMinorUnits(input.amount_ht);
    const tva = this.toMinorUnits(input.amount_tva);
    const ttc = this.toMinorUnits(input.amount_ttc);
    if (ht <= 0 || ttc <= 0 || ht + tva !== ttc) {
      throw new BadRequestException(
        'Les montants HT, TVA et TTC sont incohérents',
      );
    }
    const rate = Number(input.tax_rate);
    if (!Number.isFinite(rate) || rate < 0 || rate > 100) {
      throw new BadRequestException('Taux de TVA invalide');
    }
    const expectedTva = Math.round((ht * rate) / 100);
    if (Math.abs(expectedTva - tva) > 1) {
      throw new BadRequestException(
        'Le montant de TVA ne correspond pas au taux indiqué',
      );
    }
  }

  private toMinorUnits(value: number): number {
    const numeric = Number(value);
    const scaled = numeric * 100;
    const rounded = Math.round(scaled);
    if (
      !Number.isFinite(numeric) ||
      numeric < 0 ||
      Math.abs(scaled - rounded) > 0.000001 ||
      !Number.isSafeInteger(rounded)
    ) {
      throw new BadRequestException(
        'Les montants utilisent au plus deux décimales',
      );
    }
    return rounded;
  }

  private eventPayload(invoice: SupplierInvoice): Record<string, any> {
    return {
      supplierInvoiceId: invoice.id,
      invoiceNumber: invoice.invoice_number,
      invoiceDate: invoice.invoice_date,
      description: invoice.description,
      amountHt: Number(invoice.amount_ht),
      amountTva: Number(invoice.amount_tva),
      amountTtc: Number(invoice.amount_ttc),
      supplierName: invoice.supplier?.company_name ?? null,
      supplierCategory: invoice.supplier?.category ?? null,
      paymentDate: invoice.payment_date,
      paymentMethod: invoice.payment_method,
      paymentReference: invoice.payment_reference,
    };
  }
}
