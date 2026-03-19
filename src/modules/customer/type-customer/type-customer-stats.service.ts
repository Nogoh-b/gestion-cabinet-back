// src/modules/customer/type-customer/services/type-customer-stats.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TypeCustomer } from './entities/type_customer.entity';
import { TypeCustomerDetailDto, TypeCustomerStatsDto } from './dto/type-customer-stats.dto';

@Injectable()
export class TypeCustomerStatsService {
  constructor(
    @InjectRepository(TypeCustomer)
    private typeCustomerRepository: Repository<TypeCustomer>,
  ) {}

  async getStats(): Promise<TypeCustomerStatsDto> {
    const types = await this.typeCustomerRepository
      .createQueryBuilder('type')
      .leftJoinAndSelect('type.customers', 'customer')
      .leftJoinAndSelect('type.requiredDocuments', 'document')
      .loadRelationCountAndMap('type.customersCount', 'type.customers')
      .loadRelationCountAndMap('type.documentsCount', 'type.requiredDocuments')
      .getMany();

    const active = types.filter(t => t.status === 1).length;
    const inactive = types.filter(t => t.status !== 1).length;

    const details: TypeCustomerDetailDto[] = types.map(t => ({
      id: t.id,
      name: t.name,
      code: t.code,
      customersCount: t.customers?.length || 0,
      requiredDocumentsCount: t.requiredDocuments?.length || 0,
      status: t.status,
      createdAt: t.created_at,
    }));

    return {
      total: types.length,
      active,
      inactive,
      details,
    };
  }
}