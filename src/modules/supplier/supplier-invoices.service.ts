import { Repository } from 'typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
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
  ) {
    super(repository, paginationService);
  }

  async create(dto: CreateSupplierInvoiceDto): Promise<SupplierInvoice> {
    const entity = this.repository.create(dto);
    const supplier = await this.supplierRepo.findOne({ where: { id: dto.supplier_id } });
    if (!supplier) throw new NotFoundException('Fournisseur non trouvé');
    entity.supplier = supplier;
    if (dto.branch_id) {
      const branch = await this.branchRepo.findOne({ where: { id: dto.branch_id } });
      if (!branch) throw new NotFoundException('Agence non trouvée');
      entity.branch = branch;
    }
    return this.repository.save(entity);
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
    return this.repository.save({ ...invoice, ...dto });
  }

  async remove(id: number): Promise<void> {
    await this.repository.delete(id);
  }
}