import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1 } from 'src/core/shared/services/search/base-v1.service';
import { Repository } from 'typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';

import { Employee } from '../agencies/employee/entities/employee.entity';
import { Customer } from '../customer/customer/entities/customer.entity';
import { CreateReferrerDto } from './dto/create-referral.dto';
import { UpdateReferrerDto } from './dto/update-referral.dto';
import { Referrer } from './entities/referral.entity';


@Injectable()
export class ReferrersService extends BaseServiceV1<Referrer> {
  constructor(
    protected readonly paginationService: PaginationServiceV1,
    @InjectRepository(Referrer)
    protected repository: Repository<Referrer>,
    @InjectRepository(Employee)
    private employeeRepo: Repository<Employee>,
    @InjectRepository(Customer)
    private customerRepo: Repository<Customer>,
  ) {
    super(repository, paginationService);
  }

  async create(dto: CreateReferrerDto): Promise<Referrer> {
    dto = this.normalizeReferrerDto(dto) as CreateReferrerDto;
    const entity = this.repository.create({
      ...dto,
      status: dto.status ?? true,
    });
    
    if (dto.employee_id) {
      const employee = await this.employeeRepo.findOne({ where: { id: dto.employee_id } });
      if (!employee) {
        throw new NotFoundException(`Employé avec l'ID ${dto.employee_id} non trouvé`);
      }
      entity.employee = employee;
    }
    
    if (dto.customer_id) {
      const customer = await this.customerRepo.findOne({ where: { id: dto.customer_id } });
      if (!customer) {
        throw new NotFoundException(`Client avec l'ID ${dto.customer_id} non trouvé`);
      }
      entity.customer = customer;
    }
    
    // Génération auto du referrer_code
    entity.referrer_code = await this.generateReferrerCode();
    
    return this.repository.save(entity);
  }

  findAll(): Promise<Referrer[]> {
    return this.repository.find({ where: { status: true }, relations: ['employee', 'customer'] });
  }

  async findOne(id: number): Promise<Referrer> {
    const referrer = await this.repository.findOne({
      where: { id },
      relations: ['employee', 'customer', 'dossier_referrals', 'dossier_referrals.commissions'],
    });
    if (!referrer) throw new NotFoundException('Apporteur non trouvé');
    return referrer;
  }

  async update(id: number, dto: UpdateReferrerDto): Promise<Referrer> {
    const referrer = await this.findOne(id);
    dto = this.normalizeReferrerDto(dto) as UpdateReferrerDto;
    
    if (dto.employee_id) {
      const employee = await this.employeeRepo.findOne({ where: { id: dto.employee_id } });
      if (!employee) {
        throw new NotFoundException(`Employé avec l'ID ${dto.employee_id} non trouvé`);
      }
      referrer.employee = employee;
    } else if (dto.employee_id === null) {
      // Si on veut supprimer l'association
      referrer.employee = null;
    }
    
    if (dto.customer_id) {
      const customer = await this.customerRepo.findOne({ where: { id: dto.customer_id } });
      if (!customer) {
        throw new NotFoundException(`Client avec l'ID ${dto.customer_id} non trouvé`);
      }
      referrer.customer = customer;
    } else if (dto.customer_id === null) {
      // Si on veut supprimer l'association
      referrer.customer = null;
    }
    
    // Mettre à jour les autres propriétés
    Object.assign(referrer, dto);
    
    return this.repository.save(referrer);
  }

  async remove(id: number): Promise<void> {
    await this.repository.delete(id);
  }

  private normalizeReferrerDto(dto: CreateReferrerDto | UpdateReferrerDto): CreateReferrerDto | UpdateReferrerDto {
    const employeeId = dto.is_internal
      ? this.toNullableNumber(dto.employee_id)
      : null;
    const customerId = dto.referrer_type === 'client'
      ? this.toNullableNumber(dto.customer_id)
      : null;

    return {
      ...dto,
      employee_id: employeeId as any,
      customer_id: customerId as any,
      default_commission_rate: this.toNullableNumber(dto.default_commission_rate) as any,
      payment_method: (dto.payment_method || null) as any,
      bank_name: this.toNullableString(dto.bank_name) as any,
      bank_account_holder: this.toNullableString(dto.bank_account_holder) as any,
      bank_iban: this.toNullableString(dto.bank_iban) as any,
      contact_name: this.toNullableString(dto.contact_name) as any,
      email: this.toNullableString(dto.email) as any,
      phone: this.toNullableString(dto.phone) as any,
      address: this.toNullableString(dto.address) as any,
      notes: this.toNullableString(dto.notes) as any,
      status: dto.status ?? true,
    };
  }

  private toNullableNumber(value: unknown): number | null {
    if (value === '' || value === null || value === undefined) return null;
    const numberValue = Number(value);
    return Number.isFinite(numberValue) ? numberValue : null;
  }

  private toNullableString(value: unknown): string | null {
    if (value === '' || value === null || value === undefined) return null;
    return String(value);
  }

  private async generateReferrerCode(): Promise<string> {
    const tenantId = getCurrentTenantId() || 1;
    let sequence = (await this.repository.count()) + 1;

    for (let attempt = 0; attempt < 100; attempt += 1) {
      const code = `REF-${tenantId}-${String(sequence).padStart(3, '0')}`;
      const existing = await this.repository.findOne({ where: { referrer_code: code } });
      if (!existing) return code;
      sequence += 1;
    }

    return `REF-${tenantId}-${Date.now().toString(36).toUpperCase()}`;
  }
}
