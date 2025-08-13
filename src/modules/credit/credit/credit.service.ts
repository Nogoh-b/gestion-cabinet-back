import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Credit } from './entities/credit.entity';
import { Repository } from 'typeorm';
import { CREDIT_STATUS } from '../../../utils/types';

@Injectable()
export class CreditService {
  constructor(
    @InjectRepository(Credit)
    private readonly creditsRepository: Repository<Credit>,
  ) {}

  async findAllCreditsByCustomerId(customerId: number) {
    return await this.creditsRepository.findBy({
      customer: { id: customerId },
    });
    //.map((credit) => ({ ...credit, customer: { id: customerId } }));
  }

  async findOneCreditByCustomerId(id: number, customerId: number) {
    const credit = await this.creditsRepository.findOneBy({
      id,
      customer: { id: customerId },
    });
    if (!credit) return null;
    return credit;
  }

  async setApprovedCreditByCustomerId(id: number, customerId: number) {
    const credit = await this.findOneCreditByCustomerId(id, customerId);
    if(!credit) return null;
    const docs = credit.typeDocument.map(tD => tD.status);
    await this.updateCreditByCustomerId(id, customerId, {
      status: CREDIT_STATUS.APPROVED,
    });
  }

  async setRevokedCreditByCustomerId(id: number, customerId: number) {
    await this.updateCreditByCustomerId(id, customerId, {
      status: CREDIT_STATUS.REJECTED,
    });
  }

  async updateCreditByCustomerId(
    id: number,
    customerId: number,
    data: Partial<Credit>,
  ) {}

  async deleteCreditByCustomerId(id: number, customerId: number) {}
}
