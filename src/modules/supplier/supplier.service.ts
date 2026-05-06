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
    const count = await this.repository.count();
    entity.supplier_code = `SUP-${String(count + 1).padStart(3, '0')}`;
    return this.repository.save(entity);
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
}