import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { GuarantyEstimation } from './entity/guaranty_estimation.entity';
import { CREDIT_STATUS } from '../../../../utils/types';
import { DocumentCustomer } from '../../../documents/document-customer/entities/document-customer.entity';

@Injectable()
export class GuarantyEstimationService {
  constructor(
    @InjectRepository(GuarantyEstimation)
    private readonly guarantyEstimationRepository: Repository<GuarantyEstimation>,
    @InjectRepository(DocumentCustomer)
    private readonly documentCustomerRepository: Repository<DocumentCustomer>,
  ) {}
  async addGuarantyEstimation(data: GuarantyEstimation) {
    const guaranty = this.guarantyEstimationRepository.create(data);
    return await this.guarantyEstimationRepository.save(guaranty);
  }

  async deleteGuarantyEstimation(id: number) {
    await this.guarantyEstimationRepository.delete(id);
    return true;
  }

  async findOneGuarantyEstimation(id: number) {
    const typeGuaranty = await this.guarantyEstimationRepository.findOne({
      relations: { typeGuaranty: { typeOfDocument: true }, documents: true },
      where: { id },
    });
    if (!typeGuaranty)
      return {
        success: false,
        status: HttpStatus.NOT_FOUND,
        message: 'Not Found',
      };
    return typeGuaranty;
  }

  async validGuarantyEstimation(guaranty: GuarantyEstimation) {
    const document = guaranty.documents;
    document.status = 1;
    await this.documentCustomerRepository.save(document);
    return await this.guarantyEstimationRepository.update(guaranty.id, {
      status: CREDIT_STATUS.APPROVED,
    });
  }

  async rejectGuarantyEstimation(id: number) {
    return await this.guarantyEstimationRepository.update(id, {
      status: CREDIT_STATUS.REJECTED,
    });
  }
}
