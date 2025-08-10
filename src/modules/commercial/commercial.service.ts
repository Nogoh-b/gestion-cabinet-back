// src/commercial/commercial.service.ts
import { plainToInstance } from 'class-transformer';
import { DateRange, PaginatedResult, PaginationOptions, SearchOptions } from 'src/core/shared/interfaces/pagination.interface';
import { PaginationService } from 'src/core/shared/services/pagination/pagination.service';
import { BaseService } from 'src/core/shared/services/search/base.service';
import { Repository } from 'typeorm';
import { forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';



import { CustomersService } from '../customer/customer/customer.service';
import { CustomerStatus } from '../customer/customer/entities/customer.entity';
import { DocumentCustomerService } from '../documents/document-customer/document-customer.service';
import { SavingsAccountResponseDto } from '../savings-account/savings-account/dto/response-savings-account.dto';
import { SavingsAccountService } from '../savings-account/savings-account/savings-account.service';
import { TransactionSavingsAccount } from '../transaction/transaction_saving_account/entities/transaction_saving_account.entity';
import { TransactionSavingsAccountService } from '../transaction/transaction_saving_account/transaction_saving_account.service';
import { CreateCommercialDto } from './dto/create-commercial.dto';
import { Commercial } from './entities/commercial.entity';




@Injectable()
export class CommercialService extends BaseService<Commercial> {
  constructor(

    private paginationService: PaginationService,
    @Inject(forwardRef(() => CustomersService))
    private customerService: CustomersService,
    @Inject(forwardRef(() => SavingsAccountService))
    private savingsAccountService: SavingsAccountService,
    @Inject(forwardRef(() => TransactionSavingsAccountService))
    private readonly transactionService: TransactionSavingsAccountService,
    @InjectRepository(Commercial)
    private readonly commercialRepository: Repository<Commercial>,
    private readonly documentCustomerService: DocumentCustomerService,

  ) {
    super();console.log(forwardRef)
  }

  getRepository(): Repository<Commercial> {
    return this.commercialRepository;
  }

  /**
   * Crée un nouveau partenaire
   */
  async createCommercial(dto: CreateCommercialDto): Promise<Commercial> {
    const customer = await this.customerService.findOne(dto.customer_id);
    const partnerExisting = await this.getBycustomerId(customer.id)
    if(partnerExisting){
        if(partnerExisting.status === CustomerStatus.ACTIVE)
          return partnerExisting;
        dto.status = CustomerStatus.ACTIVE
    }
    const saving_account = await this.savingsAccountService.findOneByCustomer(customer.id)
    // const savingsAccount = await 
    dto.name = customer.first_name + ' ' + customer.last_name;
    const partner = this.commercialRepository.create({...dto, customer, saving_account});
    return this.commercialRepository.save(partner);
  }

  /**
   * Récupère tous les partenaires
   */
  async getAll(isDeactivate : boolean = false,    page?: number,
    limit?: number,
    term?: string,
    fields?: string[],
    exact?: boolean,
    from?: string,
    to?: string,branch_id = 0): Promise<PaginatedResult<Commercial>> {
        const qb = this.commercialRepository.createQueryBuilder('partnr')
        .leftJoinAndSelect('partnr.customer', 'customer')
        .leftJoinAndSelect('partnr.saving_account', 'saving_account');
    
        // 2. Application du filtre sur le status
        qb.where(
          isDeactivate
            ? 'partnr.status = :status'
            : '',
          { status: CustomerStatus.ACTIVE }
        );
    
        const options: PaginationOptions & { search?: SearchOptions; 
        dateRange?: DateRange } = { page, limit };
        if (term) options.search = { term, fields, exact };
        if (from || to) options.dateRange = { from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined };
        console.log('------options11---- ', options)
        const paginatedResult = await this.paginationService.paginate<Commercial>(qb, options);
        const data = paginatedResult.data.map(partner => 
          plainToInstance(Commercial, partner)
        );
    
        return {
        ...paginatedResult,
        data}
  }

  /**
   * Récupère un partenaire par son ID
   */
  async getById(commercial_code: string): Promise<Commercial> {
    const partner = await this.commercialRepository.findOne({where: { commercial_code }, relations: ['customer','saving_account']});
    if (!partner) {
      throw new NotFoundException(`Partenaire ${commercial_code} introuvable`);
    }
    return partner;
  }
    /**
   * Récupère un partenaire par son ID   
   */
  async getBycustomerId(customer_id: number): Promise<Commercial | null> {
    const partner = await this.commercialRepository.findOne({where: { customer_id }, relations: ['customer','saving_account']});

    return partner;
  }
  async getByCode(commercial_code: string = "F6XH"): Promise<Commercial | null> {
    if (!commercial_code || typeof commercial_code !== 'string') {
      throw new Error('Le code doit être une chaîne de caractères non vide');
    }
    // return new Commercial();
    return await this.commercialRepository.findOne({
      where: { commercial_code },
      relations: ['customer', 'saving_account']
    });
  }

  async buyAll(commercial_code: string = "F6XH"): Promise<any> {
    const com = await this.getByCode(commercial_code);
    return await this.transactionService.unlockTransactionByCommercial(commercial_code, com?.saving_account?.id);
  }


  async updateStatus(commercial_code: string, status: number): Promise<Commercial | null> {
    const partner = await this.getByCode(commercial_code);
    if(!partner)throw new NotFoundException(`Partenaire avec le code ${commercial_code} introuvable`);
      partner.status = status;
    return this.commercialRepository.save(partner);
  }

  async getSavingsAccountsByCommercial(
      page?: number,
    limit?: number,
    term?: string,
    fields?: string[],
    exact?: boolean,
    from?: string,
    to?: string,commercial_code = 0): Promise<PaginatedResult<SavingsAccountResponseDto>> {
      console.log('getSavingsAccountsByCommercial ', commercial_code)
    return this.savingsAccountService.findAllPartnerCommisionHasCreated(
      undefined,    
      page,
      limit,
      term,
      fields,
      exact,
      from,
      to,0,{commercial_code}
    );
  }

    async getTransactionsByCode(    page?: number,
    limit?: number,
    term?: string,
    fields?: string[],
    exact?: boolean,
    from?: string,
    to?: string, commercial_code?: string): Promise<PaginatedResult<TransactionSavingsAccount>> {
    return await this.transactionService.findAll(page,
      limit,
      term,
      fields,
      exact,
      from,
      to, {commercial_code})
    }

    async checkPromoCode(commercial_code: string): Promise<any> {
      const partner = await this.commercialRepository.findOne({where: { commercial_code }, relations: ['customer','saving_account','saving_account.type_savings_account']});
      if (!partner) {
        throw new NotFoundException(`Commercial ${commercial_code} introuvable`);
      }
      const doc = await this.documentCustomerService.findByType('PHOTO 4X4')
      const {name} = partner
      let  file_path = ''
      if(doc)
        file_path = doc.file_path
      return {name, file_path};
    }
}
