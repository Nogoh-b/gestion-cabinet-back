import { DataSource, Repository } from 'typeorm';
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { generateEntityCode } from 'src/core/shared/utils/code.util';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1 } from 'src/core/shared/services/search/base-v1.service';
import { CreateSupplierInvoiceDto } from './dto/create-supplier-invoice.dto';
import { UpdateSupplierInvoiceDto } from './dto/update-supplier-invoice.dto';
import { Supplier } from './entities/supplier.entity';
import { SupplierInvoice } from './entities/supplier-invoice.entity';
import { Branch } from '../agencies/branch/entities/branch.entity';
import { User } from '../iam/user/entities/user.entity';
import { CaseBillingService } from '../case-workflow/services/case-billing.service';
import {
  BillableItem,
} from '../case-workflow/entities/billing.entity';
import { BillableItemStatus } from '../case-workflow/case-workflow.enums';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { DossierAction } from '../case-workflow/entities/dossier-action.entity';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';

@Injectable()
export class SupplierInvoicesService extends BaseServiceV1<SupplierInvoice> {
  constructor(
    protected readonly paginationService: PaginationServiceV1,
    @InjectRepository(SupplierInvoice)
    protected repository: Repository<SupplierInvoice>,
    @InjectRepository(Supplier)
    private supplierRepo: Repository<Supplier>,
    @InjectRepository(Branch)
    private branchRepo: Repository<Branch>,
    @InjectRepository(User)
    private userRepo: Repository<User>,
    private readonly eventEmitter: EventEmitter2,
    private readonly dataSource: DataSource,
    private readonly caseBillingService: CaseBillingService,
  ) {
    super(repository, paginationService);
  }

  async create(
    dto: CreateSupplierInvoiceDto,
    actorUserId: number | null = null,
  ): Promise<SupplierInvoice> {
    // Numéro facultatif : si le fournisseur n'a pas communiqué de numéro,
    // une référence interne est générée automatiquement.
    if (!dto.invoice_number?.trim()) {
      dto.invoice_number = generateEntityCode('FF');
    }
    const entity = this.repository.create(dto);
    if (actorUserId != null) entity.created_by_id = actorUserId;
    await this.assertBillingRelations(dto);
    const supplier = await this.supplierRepo.findOne({
      where: { id: dto.supplier_id },
    });
    if (!supplier) throw new NotFoundException('Fournisseur non trouvé');
    entity.supplier = supplier;
    if (dto.branch_id) {
      const branch = await this.branchRepo.findOne({
        where: { id: dto.branch_id },
      });
      if (!branch) throw new NotFoundException('Agence non trouvée');
      entity.branch = branch;
    }
    if (dto.status === 'paid' && !entity.payment_date) {
      entity.payment_date = new Date();
    }
    const saved = await this.repository.save(entity);

    // Si la facture est créée directement à un statut comptabilisable, on émet
    // les mêmes événements que lors d'une transition de statut via update().
    const full = await this.findOne(saved.id);
    if (saved.status === 'approved' || saved.status === 'paid') {
      this.eventEmitter.emit('supplier_invoice.approuvee', full);
    }
    if (saved.status === 'paid') {
      this.eventEmitter.emit('supplier_invoice.payee', full);
    }

    if (saved.status === 'approved' || saved.status === 'paid') {
      await this.dataSource.transaction((manager) =>
        this.caseBillingService.syncSupplierInvoiceToBillableItem(
          manager,
          full,
          actorUserId,
          true,
        ),
      );
    }

    return saved;
  }

  findAll(): Promise<SupplierInvoice[]> {
    return this.repository.find({
      relations: ['supplier', 'branch'],
      order: { invoice_date: 'DESC' },
    });
  }

  async findOne(id: number): Promise<SupplierInvoice> {
    const invoice = await this.repository.findOne({
      where: { id },
      relations: ['supplier', 'branch', 'created_by', 'dossier'],
    });
    if (!invoice)
      throw new NotFoundException('Facture fournisseur non trouvée');
    return invoice;
  }

  async findBySupplier(supplier_id: number): Promise<SupplierInvoice[]> {
    return this.repository.find({
      where: { supplier_id },
      relations: ['supplier'],
      order: { invoice_date: 'DESC' },
    });
  }

  async update(
    id: number,
    dto: UpdateSupplierInvoiceDto,
    actorUserId: number | null = null,
  ): Promise<SupplierInvoice> {
    const invoice = await this.findOne(id);
    const previousStatus = invoice.status;
    await this.assertBillableItemMutable(id, dto);
    await this.assertBillingRelations({
      dossier_id: dto.dossier_id ?? invoice.dossier_id ?? undefined,
      action_id: dto.action_id ?? invoice.action_id ?? undefined,
      is_rebillable: dto.is_rebillable ?? invoice.is_rebillable,
    });
    if (dto.supplier_id) {
      const supplier = await this.supplierRepo.findOne({
        where: { id: dto.supplier_id },
      });
      if (!supplier) throw new NotFoundException('Fournisseur non trouvé');
      invoice.supplier = supplier;
    }
    if (dto.branch_id) {
      const branch = await this.branchRepo.findOne({
        where: { id: dto.branch_id },
      });
      if (!branch) throw new NotFoundException('Agence non trouvée');
      invoice.branch = branch;
    }
    const saved = await this.repository.save({ ...invoice, ...dto });

    const full = await this.findOne(saved.id);
    if (previousStatus !== 'approved' && saved.status === 'approved') {
      this.eventEmitter.emit('supplier_invoice.approuvee', full);
    }
    if (previousStatus !== 'paid' && saved.status === 'paid') {
      this.eventEmitter.emit('supplier_invoice.payee', full);
    }

    await this.dataSource.transaction((manager) =>
      this.caseBillingService.syncSupplierInvoiceToBillableItem(
        manager,
        full,
        actorUserId,
      ),
    );

    return saved;
  }

  /** Passe la facture à « approuvée » (émet l'événement de comptabilisation via update). */
  async approve(
    id: number,
    actorUserId: number | null = null,
  ): Promise<SupplierInvoice> {
    const invoice = await this.findOne(id);
    if (invoice.status === 'paid' || invoice.status === 'cancelled') {
      throw new BadRequestException(
        'Facture déjà payée ou annulée : approbation impossible.',
      );
    }
    return this.update(id, { status: 'approved' } as any, actorUserId);
  }

  /** Passe la facture à « payée » et date le paiement. */
  async markAsPaid(
    id: number,
    actorUserId: number | null = null,
  ): Promise<SupplierInvoice> {
    const invoice = await this.findOne(id);
    if (invoice.status === 'cancelled') {
      throw new BadRequestException('Facture annulée : paiement impossible.');
    }
    if (invoice.status === 'paid') {
      throw new BadRequestException('Facture déjà payée.');
    }
    return this.update(
      id,
      { status: 'paid', payment_date: new Date() } as any,
      actorUserId,
    );
  }

  async remove(id: number): Promise<void> {
    const tenantId = getCurrentTenantId();
    await this.dataSource.transaction(async (manager) => {
      const repository = manager.getRepository(SupplierInvoice);
      const invoice = await repository.findOne({
        where: { id, tenant_id: tenantId },
      });
      if (!invoice) {
        throw new NotFoundException('Facture fournisseur non trouvée');
      }
      invoice.is_rebillable = false;
      const item = await this.caseBillingService.syncSupplierInvoiceToBillableItem(
        manager,
        invoice,
        null,
      );
      if (
        item &&
        [
          BillableItemStatus.RESERVED,
          BillableItemStatus.INVOICED,
          BillableItemStatus.ADJUSTED,
        ].includes(item.status)
      ) {
        throw new ConflictException(
          'Cette dépense est déjà engagée dans la facturation et ne peut plus être supprimée',
        );
      }
      await repository.delete({ id, tenant_id: tenantId });
    });
  }

  private async assertBillingRelations(dto: {
    dossier_id?: number;
    action_id?: string;
    is_rebillable?: boolean;
  }): Promise<void> {
    const tenantId = getCurrentTenantId();
    if (dto.is_rebillable && !dto.dossier_id) {
      throw new BadRequestException(
        'Un dossier est obligatoire pour refacturer une facture fournisseur',
      );
    }
    if (!dto.dossier_id && dto.action_id) {
      throw new BadRequestException(
        'Un dossier est obligatoire pour associer une action',
      );
    }
    if (dto.dossier_id) {
      const dossier = await this.dataSource.getRepository(Dossier).findOne({
        where: { id: dto.dossier_id, tenant_id: tenantId },
      });
      if (!dossier) throw new NotFoundException('Dossier non trouvé');
    }
    if (dto.action_id) {
      const action = await this.dataSource.getRepository(DossierAction).findOne({
        where: {
          id: dto.action_id,
          dossier_id: dto.dossier_id!,
          tenant_id: tenantId,
        },
      });
      if (!action) {
        throw new BadRequestException(
          'L’action associée n’appartient pas au dossier sélectionné',
        );
      }
    }
  }

  private async assertBillableItemMutable(
    invoiceId: number,
    dto: UpdateSupplierInvoiceDto,
  ): Promise<void> {
    const billingFields = [
      'amount_ht',
      'amount_tva',
      'amount_ttc',
      'tax_rate',
      'dossier_id',
      'action_id',
      'is_rebillable',
      'rebilling_type',
      'currency',
      'description',
      'invoice_date',
      'attachment_url',
    ];
    if (!billingFields.some((field) => field in dto)) return;
    const item = await this.dataSource.getRepository(BillableItem).findOne({
      where: {
        tenant_id: getCurrentTenantId(),
        source_event_key: `SUPPLIER_INVOICE:${invoiceId}:APPROVED`,
      },
    });
    if (
      item &&
      [
        BillableItemStatus.RESERVED,
        BillableItemStatus.INVOICED,
        BillableItemStatus.ADJUSTED,
      ].includes(item.status)
    ) {
      throw new ConflictException(
        'Cette dépense est déjà engagée dans la facturation. Utilisez un ajustement.',
      );
    }
  }
}
