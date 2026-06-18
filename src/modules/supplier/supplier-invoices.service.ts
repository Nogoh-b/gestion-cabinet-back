import { Repository } from 'typeorm';
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
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
  ) {
    super(repository, paginationService);
  }

  async create(dto: CreateSupplierInvoiceDto): Promise<SupplierInvoice> {
    // Numéro facultatif : si le fournisseur n'a pas communiqué de numéro,
    // une référence interne est générée automatiquement.
    if (!dto.invoice_number?.trim()) {
      dto.invoice_number = generateEntityCode('FF');
    }
    const entity = this.repository.create(dto);
    const supplier = await this.supplierRepo.findOne({ where: { id: dto.supplier_id } });
    if (!supplier) throw new NotFoundException('Fournisseur non trouvé');
    entity.supplier = supplier;
    if (dto.branch_id) {
      const branch = await this.branchRepo.findOne({ where: { id: dto.branch_id } });
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
      relations: ['supplier', 'branch', 'created_by'],
    });
    if (!invoice) throw new NotFoundException('Facture fournisseur non trouvée');
    return invoice;
  }

  async findBySupplier(supplier_id: number): Promise<SupplierInvoice[]> {
    return this.repository.find({
      where: { supplier_id },
      relations: ['supplier'],
      order: { invoice_date: 'DESC' },
    });
  }

  async update(id: number, dto: UpdateSupplierInvoiceDto): Promise<SupplierInvoice> {
    const invoice = await this.findOne(id);
    const previousStatus = invoice.status;
    if (dto.supplier_id) {
      const supplier = await this.supplierRepo.findOne({ where: { id: dto.supplier_id } });
      if (!supplier) throw new NotFoundException('Fournisseur non trouvé');
      invoice.supplier = supplier;
    }
    if (dto.branch_id) {
      const branch = await this.branchRepo.findOne({ where: { id: dto.branch_id } });
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

    return saved;
  }

  /** Passe la facture à « approuvée » (émet l'événement de comptabilisation via update). */
  async approve(id: number): Promise<SupplierInvoice> {
    const invoice = await this.findOne(id);
    if (invoice.status === 'paid' || invoice.status === 'cancelled') {
      throw new BadRequestException('Facture déjà payée ou annulée : approbation impossible.');
    }
    return this.update(id, { status: 'approved' } as any);
  }

  /** Passe la facture à « payée » et date le paiement. */
  async markAsPaid(id: number): Promise<SupplierInvoice> {
    const invoice = await this.findOne(id);
    if (invoice.status === 'cancelled') {
      throw new BadRequestException('Facture annulée : paiement impossible.');
    }
    if (invoice.status === 'paid') {
      throw new BadRequestException('Facture déjà payée.');
    }
    return this.update(id, { status: 'paid', payment_date: new Date() } as any);
  }

  async remove(id: number): Promise<void> {
    await this.repository.delete(id);
  }
}