import { Repository } from 'typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1 } from 'src/core/shared/services/search/base-v1.service';
import { Supplier } from './entities/supplier.entity';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { Branch } from '../agencies/branch/entities/branch.entity';

@Injectable()
export class SuppliersService extends BaseServiceV1<Supplier> {
  constructor(
    protected readonly paginationService: PaginationServiceV1,
    @InjectRepository(Supplier)
    protected repository: Repository<Supplier>,
    @InjectRepository(Branch)
    private branchRepo: Repository<Branch>,
  ) {
    super(repository, paginationService);
  }

  async create(dto: CreateSupplierDto): Promise<Supplier> {
    const entity = this.repository.create(dto);
    if (dto.branch_id) {
      const branch = await this.branchRepo.findOne({ where: { id: dto.branch_id } });
      if (!branch) throw new NotFoundException('Agence non trouvée');
      entity.branch = branch;
    }
    entity.supplier_code = await this.generateSupplierCode();
    return this.saveWithUniqueSupplierCode(entity);
  }

  findAll(): Promise<Supplier[]> {
    return this.repository.find({
      where: { status: true },
      relations: ['branch'],
      order: { company_name: 'ASC' },
    });
  }

  async findOne(id: number): Promise<Supplier> {
    const supplier = await this.repository.findOne({
      where: { id },
      relations: ['branch', 'invoices'],
    });
    if (!supplier) throw new NotFoundException('Fournisseur non trouvé');
    return supplier;
  }

  async update(id: number, dto: UpdateSupplierDto): Promise<Supplier> {
    const supplier = await this.findOne(id);
    if (dto.branch_id) {
      const branch = await this.branchRepo.findOne({ where: { id: dto.branch_id } });
      if (!branch) throw new NotFoundException('Agence non trouvée');
      supplier.branch = branch;
    }
    return this.repository.save({ ...supplier, ...dto });
  }

  async remove(id: number): Promise<void> {
    await this.repository.delete(id);
  }

  private async generateSupplierCode(): Promise<string> {
    const last = await this.repository
      .createQueryBuilder('supplier')
      .withDeleted()
      .where('supplier.supplier_code LIKE :prefix', { prefix: 'SUP-%' })
      .orderBy('supplier.supplier_code', 'DESC')
      .getOne();

    const lastSequence = last?.supplier_code?.match(/^SUP-(\d+)$/)?.[1];
    let sequence = lastSequence ? Number(lastSequence) + 1 : 1;

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const supplier_code = `SUP-${String(sequence).padStart(3, '0')}`;
      const exists = await this.repository.findOne({ where: { supplier_code }, withDeleted: true });
      if (!exists) return supplier_code;
      sequence += 1;
    }

    return `SUP-${Date.now().toString(36).toUpperCase()}`;
  }

  private isDuplicateSupplierCodeError(error: any): boolean {
    return (
      error?.code === 'ER_DUP_ENTRY' &&
      (String(error?.message ?? '').includes('supplier_code') ||
        String(error?.message ?? '').includes('IDX_7f1a06837f963490d84ce48c86'))
    );
  }

  private async saveWithUniqueSupplierCode(entity: Supplier): Promise<Supplier> {
    let attempt = 0;
    while (attempt++ < 5) {
      try {
        return await this.repository.save(entity);
      } catch (error) {
        if (!this.isDuplicateSupplierCodeError(error)) throw error;
        entity.supplier_code = await this.generateSupplierCode();
      }
    }
    return this.repository.save(entity);
  }
}
