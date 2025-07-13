// src/partner/partner.service.ts
import { plainToInstance } from 'class-transformer';
import { DateRange, PaginatedResult, PaginationOptions, SearchOptions } from 'src/core/shared/interfaces/pagination.interface';
import { PaginationService } from 'src/core/shared/services/pagination/pagination.service';
import { BaseService } from 'src/core/shared/services/search/base.service';





import { Repository } from 'typeorm';
import { forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';




















import { CustomersService } from '../customer/customer/customer.service';
import { CustomerStatus } from '../customer/customer/entities/customer.entity';
import { SavingsAccountResponseDto } from '../savings-account/savings-account/dto/response-savings-account.dto';
import { SavingsAccountService } from '../savings-account/savings-account/savings-account.service';
import { TransactionSavingsAccount } from '../transaction/transaction_saving_account/entities/transaction_saving_account.entity';
import { TransactionSavingsAccountService } from '../transaction/transaction_saving_account/transaction_saving_account.service';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { Partner } from './entities/partner.entity';


























@Injectable()
export class PartnerService extends BaseService<Partner> {
  constructor(
    @InjectRepository(Partner)
    private readonly partnerRepository: Repository<Partner>,
    private paginationService: PaginationService,
    private customerService: CustomersService,
    @Inject(forwardRef(() => SavingsAccountService))
    private savingsAccountService: SavingsAccountService,
    @Inject(forwardRef(() => TransactionSavingsAccountService))
    private readonly transactionService: TransactionSavingsAccountService,
  ) {
    super();console.log(forwardRef)
  }

  getRepository(): Repository<Partner> {
    return this.partnerRepository;
  }

  /**
   * Crée un nouveau partenaire
   */
  async createPartner(dto: CreatePartnerDto): Promise<Partner> {
    const customer = await this.customerService.findOne(dto.customer_id);
    const partnerExisting = await this.getBycustomerId(customer.id)
    if(partnerExisting){
        if(partnerExisting.status === CustomerStatus.ACTIVE)
          return partnerExisting;
        dto.status = CustomerStatus.ACTIVE
    }
    const saving_account = await this.savingsAccountService.findOneByCustomer(customer.id)
    // const savingsAccount = await 
    const partner = this.partnerRepository.create({...dto, customer, saving_account});
    return this.partnerRepository.save(partner);
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
    to?: string,branch_id = 0): Promise<PaginatedResult<Partner>> {
        const qb = this.partnerRepository.createQueryBuilder('partnr')
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
        const paginatedResult = await this.paginationService.paginate<Partner>(qb, options);
        const data = paginatedResult.data.map(partner => 
          plainToInstance(Partner, partner)
        );
    
        return {
        ...paginatedResult,
        data}
  }

  /**
   * Récupère un partenaire par son ID
   */
  async getById(promo_code: string): Promise<Partner> {
    const partner = await this.partnerRepository.findOne({where: { promo_code }, relations: ['customer','saving_account']});
    if (!partner) {
      throw new NotFoundException(`Partenaire ${promo_code} introuvable`);
    }
    return partner;
  }
    /**
   * Récupère un partenaire par son ID
   */
  async getBycustomerId(customer_id: number): Promise<Partner | null> {
    const partner = await this.partnerRepository.findOne({where: { customer_id }, relations: ['customer','saving_account']});

    return partner;
  }
  async getByCode(promo_code: string = "F6XH"): Promise<Partner | null> {
    if (!promo_code || typeof promo_code !== 'string') {
      throw new Error('Le code doit être une chaîne de caractères non vide');
    }

    return this.partnerRepository.findOne({
      where: { promo_code },
      relations: ['customer', 'saving_account']
    });
  }
  async updateStatus(promo_code: string, status: number): Promise<Partner | null> {
    const partner = await this.getByCode(promo_code);
    if(!partner)throw new NotFoundException(`Partenaire avec le code ${promo_code} introuvable`);
      partner.status = status;
    return this.partnerRepository.save(partner);
  }

  async getSavingsAccountsByPartner(
      page?: number,
    limit?: number,
    term?: string,
    fields?: string[],
    exact?: boolean,
    from?: string,
    to?: string,promo_code = 0): Promise<PaginatedResult<SavingsAccountResponseDto>> {
      console.log('getSavingsAccountsByPartner ', promo_code)
    return this.savingsAccountService.findAllPartnerHasCreated(
      undefined,    
      page,
      limit,
      term,
      fields,
      exact,
      from,
      to,0,promo_code
    );
  }

    async getTransactionsByCode(    page?: number,
    limit?: number,
    term?: string,
    fields?: string[],
    exact?: boolean,
    from?: string,
    to?: string, promo_code?: string): Promise<PaginatedResult<TransactionSavingsAccount>> {
    return await this.transactionService.findAll(page,
      limit,
      term,
      fields,
      exact,
      from,
      to, {promo_code})
  }

}
