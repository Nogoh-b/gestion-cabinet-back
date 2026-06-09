import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';
import { BaseServiceV1 } from 'src/core/shared/services/search/base-v1.service';
import { Repository } from 'typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

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
    const count = await this.repository.count();
    entity.referrer_code = `REF-${String(count + 1).padStart(3, '0')}`;
    
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
}