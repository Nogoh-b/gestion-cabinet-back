import { plainToInstance } from 'class-transformer';
import { VerifyOtpDto } from 'src/core/shared/dto/otp.dto';
import { DateRange, PaginatedResult, PaginationOptions, SearchOptions } from 'src/core/shared/interfaces/pagination.interface';
import { OtpService } from 'src/core/shared/services/otp/otp.service';
import { PaginationService } from 'src/core/shared/services/pagination/pagination.service';
import { BaseService } from 'src/core/shared/services/search/base.service';

import { Branch } from 'src/modules/agencies/branch/entities/branch.entity';

import { CommercialService } from 'src/modules/commercial/commercial.service';
import { Commercial } from 'src/modules/commercial/entities/commercial.entity';
import { CustomersService } from 'src/modules/customer/customer/customer.service';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { DocumentType } from 'src/modules/documents/document-type/entities/document-type.entity';

import { Partner } from 'src/modules/partner/entities/partner.entity';


import { PartnerService } from 'src/modules/partner/partner.service';



import { CreateRessourceDto } from 'src/modules/ressource/ressource/dto/create-ressource.dto';
import { Ressource } from 'src/modules/ressource/ressource/entities/ressource.entity';


import { RessourceService } from 'src/modules/ressource/ressource/ressource.service';
import { CreateTransactionSavingsAccountDto } from 'src/modules/transaction/transaction_saving_account/dto/create-transaction_saving_account.dto';


import { TransactionSavingsAccount, TransactionSavingsAccountStatus } from 'src/modules/transaction/transaction_saving_account/entities/transaction_saving_account.entity';


import { TransactionSavingsAccountService } from 'src/modules/transaction/transaction_saving_account/transaction_saving_account.service';


import { TransactionChannel, TransactionCode, TransactionProvider } from 'src/modules/transaction/transaction_type/entities/transaction_type.entity';

import { Not, Repository } from 'typeorm';

import { BadRequestException, forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';


import { InjectRepository } from '@nestjs/typeorm';






























import { DocumentSavingAccountStatus } from '../document-saving-account/document-saving-account.service';
import { InterestSavingAccount } from '../interest-saving-account/entities/interest-saving-account.entity';
import { TypeSavingsAccount } from '../type-savings-account/entities/type-savings-account.entity';
import { TypeSavingsAccountService } from '../type-savings-account/type-savings-account.service';
import { AssignInterestRangeDto, CreateSavingsAccountDto } from './dto/create-savings-account.dto';
import { SavingsAccountResponseDto } from './dto/response-savings-account.dto';
import { UpdateSavingsAccountDto } from './dto/update-savings-account.dto';
import { SavingsAccountHasInterest } from './entities/account-has-interest.entity';
import { SavingsAccount, SavingsAccountStatus } from './entities/savings-account.entity';




























@Injectable()
export class SavingsAccountService extends BaseService<SavingsAccount> {
  constructor(
    @InjectRepository(SavingsAccount)
    private readonly repo: Repository<SavingsAccount>,
    @InjectRepository(Branch)
    private readonly branchRepo: Repository<Branch>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(TypeSavingsAccount)
    private readonly typeRepo: Repository<TypeSavingsAccount>, 
    @InjectRepository(InterestSavingAccount)
    private readonly planRepo: Repository<InterestSavingAccount>,       
    @InjectRepository(TransactionSavingsAccount)
    private readonly txRepo: Repository<TransactionSavingsAccount>,     
    @InjectRepository(SavingsAccountHasInterest)
    private readonly interestRepo: Repository<SavingsAccountHasInterest>, 
    private typeSavingAcount : TypeSavingsAccountService,
    @Inject(forwardRef(() => TransactionSavingsAccountService))
    private transactionSavingsAccountService : TransactionSavingsAccountService,
    private paginationService: PaginationService,
    @Inject(forwardRef(() => CustomersService))
    private customerService: CustomersService,
    @Inject(forwardRef(() => PartnerService))
    private partnerService: PartnerService,
    @Inject(forwardRef(() => CommercialService))
    private commercialService: CommercialService,
    private readonly ressourceService: RessourceService,
     private readonly otpService: OtpService
  ) { super(); console.log(forwardRef) }

  getRepository(): Repository<SavingsAccount> {
    return this.repo;
  }

  async findAll(isDeactivate : boolean = false,    page?: number,
    limit?: number,
    term?: string,
    fields?: string[],
    exact?: boolean,
    from?: string,
    to?: string,branch_id = 0, partner_id : any = undefined): Promise<PaginatedResult<SavingsAccountResponseDto>> {
      const qb = this.repo.createQueryBuilder('sa')
    .leftJoinAndSelect('sa.customer', 'customer')
    .leftJoinAndSelect('sa.type_savings_account', 'typeSavings')
    .leftJoinAndSelect('sa.branch', 'branch', branch_id != 0 ? 'branch.id = :branch_id' : '', { branch_id })
   
    .leftJoinAndSelect('sa.documents', 'documents')
    .leftJoinAndSelect('sa.interestRelations', 'interestRelations');

    if(partner_id != undefined)
      qb.leftJoinAndSelect(  'sa.partner', 
      'partner', 
      'partner.id IS NOT NULL AND partner.id = :partner_id', 
      { partner_id }) 
    qb.andWhere('partner.id IS NOT NULL');
    // 2. Application du filtre sur le status
    if( isDeactivate != undefined )
      qb.where(
        isDeactivate
          ? 'sa.status = :status'
          : '',
        { status: SavingsAccountStatus.DEACTIVATE }
      );


    const options: PaginationOptions & { search?: SearchOptions; 
    dateRange?: DateRange } = { page, limit };
    if (term) options.search = { term, fields, exact };
    if (from || to) options.dateRange = { from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined };
    console.log('------options11---- ', options)
    const paginatedResult = await this.paginationService.paginate<SavingsAccount>(qb, options);
    const data = paginatedResult.data.map(account => 
      plainToInstance(SavingsAccountResponseDto, account)
    );

    return {
    ...paginatedResult,
    data,
  };
  }

  async findAllPartnerCommisionHasCreated(
    isDeactivate: boolean = false,
    page?: number,
    limit?: number,
    term?: string,
    fields?: string[],
    exact?: boolean,
    from?: string,
    to?: string,
    branch_id = 0,
    data: any = {}
  ): Promise<PaginatedResult<SavingsAccountResponseDto>> {
    const qb = this.repo.createQueryBuilder('sa')
      .leftJoinAndSelect('sa.customer', 'customer')
      .leftJoinAndSelect('sa.type_savings_account', 'typeSavings')
      .leftJoinAndSelect('sa.branch', 'branch', branch_id != 0 ? 'branch.id = :branch_id' : '1=1', { branch_id })
      .leftJoinAndSelect('sa.documents', 'documents')
      .leftJoinAndSelect('sa.interestRelations', 'interestRelations');

    // Filtre partenaire
      console.log('----data.promo_code ', data )
    if ( data.promo_code ) {
      /*qb.leftJoinAndSelect('sa.partner', 'partner', 'partner.promo_code = :promo_code', { promo_code : data.promo_code })
        .andWhere('partner.promo_code IS NOT NULL');*/
      qb.where('sa.promo_code = :promo_code', { promo_code: data.promo_code });
    } else {
      // qb.leftJoinAndSelect('sa.partner', 'partner');
    }
    if (data.commercial_code !== undefined && data.commercial_code !== null) {
      /*qb.leftJoinAndSelect('sa.commercial', 'commercial', 'commercial.commercial_code = :commercial_code', { commercial_code : data.commercial_code })
        .andWhere('commercial.commercial_code IS NOT NULL');*/
        qb.where('sa.commercial_code = :commercial_code', { commercial_code: data.commercial_code });

    } else {
      qb.leftJoinAndSelect('sa.commercial', 'commercial');
    }

    // Filtre statut
    if (isDeactivate !== undefined) {
      qb.andWhere(isDeactivate 
        ? 'sa.status = :status' 
        : 'sa.status != :status OR sa.status IS NULL', 
        { status: SavingsAccountStatus.DEACTIVATE }
      );
    }

    // Options de pagination et recherche
    const options: PaginationOptions & { search?: SearchOptions; dateRange?: DateRange } = { page, limit };
    if (term) options.search = { term, fields, exact };
    if (from || to) options.dateRange = { 
      from: from ? new Date(from) : undefined, 
      to: to ? new Date(to) : undefined 
    };

    const paginatedResult = await this.paginationService.paginate<SavingsAccount>(qb, options);
    const datas = paginatedResult.data.map(account => 
      plainToInstance(SavingsAccountResponseDto, account)
    );

    return {
      ...paginatedResult,
      data: datas,
    };
  }

  async findAllPendingDocs(page?: number,
    limit?: number,
    term?: string,
    fields?: string[],
    exact?: boolean,
    from?: string,
    to?: string,): Promise<PaginatedResult<SavingsAccountResponseDto>> {
      const qb = this.repo.createQueryBuilder('sa')
    .leftJoinAndSelect('sa.customer', 'customer')
    .leftJoinAndSelect('sa.type_savings_account', 'typeSavings')
    .leftJoinAndSelect('sa.branch', 'branch')
    .leftJoinAndSelect('sa.documents', 'documents', 'documents.status = :docStatus', { docStatus: 0 })
    .leftJoinAndSelect('sa.interestRelations', 'interestRelations');

    // 2. Application du filtre sur le status
    qb.where(
        'sa.status != :status',
      { status: SavingsAccountStatus.DEACTIVATE }
    ).andWhere('documents.id IS NOT NULL');

    const options: PaginationOptions & { search?: SearchOptions; 
    dateRange?: DateRange } = { page, limit };
    if (term) options.search = { term, fields, exact };
    if (from || to) options.dateRange = { from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined };
    const paginatedResult = await this.paginationService.paginate<SavingsAccount>(qb, options);
    const data = paginatedResult.data.map(account => 
      plainToInstance(SavingsAccountResponseDto, account)
    );

    return {
    ...paginatedResult,
    data,
  };
  }
  async findOne(id: number, all = true): Promise<SavingsAccountResponseDto> {
        const relations = [
      'customer',
      'type_savings_account',
      'type_savings_account.required_documents',
      'branch',
      'documents',
      'enrolled_by',
      'interestRelations',
    ];

    if (all) {
      relations.push('originSavingsAccountTx', 'targetSavingsAccountTx');
    }
    const account = await this.repo.findOne({
      where: { id , status : Not(SavingsAccountStatus.DEACTIVATE)  },
      relations,
    });
    if (!account) throw new NotFoundException(`Compte ${id} introuvable`);
    // Mise a jour des soldes
    const soldes = await this.updateBalance(account.id)
    account.avalaible_balance = soldes.avalaible_balance
    account.balance = await soldes.balance
    account.avalaible_balance_online = await soldes.avalaible_balance_online

    /*const sa = await this.updateCodeCash(account.id)
    if(sa && sa.code_cash)
      account.code_cash = sa.code_cash;*/
    return plainToInstance(SavingsAccountResponseDto, account);
  }

  async findOneAdmin(branch_id: number = 1): Promise<SavingsAccount> {
    const account = await this.repo.findOne({
      where: { is_admin : true , status : Not(SavingsAccountStatus.DEACTIVATE) , branch_id },
      relations: [
        'customer',
        'type_savings_account',
        'branch',
        'documents',
        'enrolled_by',
        'interestRelations',
      ],
    }); 
    if (!account) throw new NotFoundException(`Compte Admin introuvable ${branch_id}`);
    const soldes = await this.updateBalance(account.id)
    account.avalaible_balance = soldes.avalaible_balance
    account.balance = await soldes.balance
    account.avalaible_balance_online = await soldes.avalaible_balance_online
    return account;
  }

  async findOneByCode(number_savings_account: string, all = true): Promise<SavingsAccountResponseDto | SavingsAccount> {
    const relations = [
      'customer',
      'type_savings_account',
      'type_savings_account.required_documents',
      'branch',
      'documents',
      'enrolled_by',
      'interestRelations',
    ];

    if (all) {
      relations.push('originSavingsAccountTx', 'targetSavingsAccountTx');
    }


    const account = await this.repo.findOne({
      where: { number_savings_account , status: Not(SavingsAccountStatus.DEACTIVATE)},
      relations,
    });
    if (!account) throw new NotFoundException(`Compte ${number_savings_account} introuvable`);
    const soldes = await this.updateBalance(account.id)
    account.avalaible_balance = soldes.avalaible_balance
    account.balance = await soldes.balance
    account.avalaible_balance_online = await soldes.avalaible_balance_online
    return  plainToInstance(SavingsAccountResponseDto, account);
  }

  async findOneByCustomer( 
    id: number,
    created_online: number | null = null
  ): Promise<SavingsAccountResponseDto> {
    const whereClause: any = { 
      customer: { id },
      status: Not(SavingsAccountStatus.DEACTIVATE)
    };

    // Ajoute le filtre created_online seulement si la valeur est non-null
    if (created_online !== null) {
      whereClause.created_online = created_online;
    }

    const account = await this.repo.findOne({
      where: whereClause,
      relations: [
        'interestRelations',
        'customer',
      ],
    });

    if (!account) {
      throw new NotFoundException(`Compte epargne pour customer ${id} introuvable ; created online ${created_online}`);
    }

    return plainToInstance(SavingsAccountResponseDto, account);
  }

  async create(
    dto: CreateSavingsAccountDto,
    is_admin = false
  ): Promise<SavingsAccountResponseDto> {
    if(is_admin){
      const acc = await this.repo.findOne({ where: { is_admin, branch_id: dto.branch_id  } });
      if (acc) throw new NotFoundException(`Compte Admin déjà existant`);
    }
    const branch = await this.branchRepo.findOne({ where: { id: dto.branch_id } });
    if (!branch) throw new NotFoundException(`Agence ${dto.branch_id} introuvable`);

    const customer = await this.customerRepo.findOne({ where: { id: dto.customer_id } });
    if (!customer) throw new NotFoundException(`Client ${dto.customer_id} introuvable`);

    const typeAccount = await this.typeRepo.findOne({ where: { id: dto.type_savings_account_id } });
    if (!typeAccount) throw new NotFoundException(
      `Type d'épargne ${dto.type_savings_account_id} introuvable`,
    );

    /*if (dto.enrolled_by_id) {
      const parrain = await this.findOne(dto.enrolled_by_id);
      if (!parrain) {
        throw new NotFoundException('Compte parrain introuvable');
      }
    }*/
    let partner : Partner | null = new Partner();
    if (dto.promo_code) {
      console.log('dto.code_promo ' ,dto)
      partner = await this.partnerService.getByCode(dto.promo_code);
      if (!partner) {
        throw new NotFoundException('Partner introuvable');
      }
    }

    let commercial : Commercial | null = new Commercial();
    if (dto.commercial_code) {
      console.log('dto.commercial_code ' ,dto)
      commercial = await this.commercialService.getByCode(dto.commercial_code);
      if (!commercial) {
        throw new NotFoundException('Commercial introuvable ' + dto.commercial_code );
      }
    }

    let number_savings_account: string;
    /*do {
      const rand = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
      number_savings_account = `${branch.code}${rand}`;
    } while (await this.repo.findOne({ where: { number_savings_account } }));*/
    number_savings_account = await this.generateNextAccountNumber(typeAccount);


    let iban = `${branch.code} ${number_savings_account} ${customer.customer_code}`;
    while (await this.repo.findOne({ where: { iban } })) {
      const rand = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
      number_savings_account = `${branch.code}${rand}`;
      iban = `${branch.code} ${number_savings_account} ${customer.customer_code}`;
    }

    const account = this.repo.create({
      branch_id: dto.branch_id,
      number_savings_account,
      fee_savings: 0.0,
      amount_created: 0,
      avalaible_balance: 0,
      status: SavingsAccountStatus.PENDING,
      // code_product: dto.code_product,
      created_online: dto.created_online,
      is_admin,
      // interest_year_savings_account: dto.interest_year_savings_account,
      iban,
      // enrolled_by: { id: dto.enrolled_by_id } as SavingsAccount,
      account_number: number_savings_account,
      customer: { id: dto.customer_id } as Customer,
      type_savings_account: {
        id: dto.type_savings_account_id,
      } as TypeSavingsAccount,

    });
    if(partner && partner.promo_code)
      account.partner = partner;
    if(commercial && commercial.commercial_code)
      account.commercial = commercial;

    if(dto.location_city_id){
      this.customerService.update(customer.id, {
        location_city_id: dto.location_city_id,
      });
    }
    // account.created_online = 1
    account.customer = customer
    return plainToInstance(SavingsAccountResponseDto, await this.repo.save(account));

    // return await this.repo.save(account);
  }

  async createOnline(
    dto: CreateSavingsAccountDto,
  ): Promise<SavingsAccountResponseDto> {


    const customer = await this.customerRepo.findOne({ where: { customer_code: dto.customer_code } , relations :['branch'] });
    if (!customer) throw new NotFoundException(`Client ${dto.customer_id} introuvable`);
    const branch = await this.branchRepo.findOne({
      where: {},
      order: { created_at: 'ASC' } // Si vous avez un timestamp de création
    });
    if (!branch) throw new NotFoundException('Aucune agence trouvée');
    dto.customer_id = customer.id;
    console.log(customer)
    dto.branch_id = branch.id
    dto.created_online = 1

    return this.create(dto)

  }

  async save(sa_s : SavingsAccount[]): Promise<any> {
    await this.repo.save(sa_s);
    return sa_s;
  }

  async update(id: number, dto: UpdateSavingsAccountDto): Promise<SavingsAccount> {
    // 1. Charge l’entité existante
    const account = await this.repo.findOne({ where: { id }, relations: ['type_savings_account'] });
    if (!account) {
      throw new NotFoundException(`Compte épargne #${id} introuvable`);
    }

    // 2. Si on veut changer le type, on affecte explicitement la relation
    if (dto.type_savings_account_id !== undefined) {
      account.type_savings_account = 
        { id: dto.type_savings_account_id } as TypeSavingsAccount;
      delete dto.type_savings_account_id;
    }

    // 3. On copie le reste des propriétés simples
    Object.assign(account, dto);

    // 4. On enregistre avec save() pour que TypeORM gère les relations
    return this.repo.save(account);
  }

  
  async updateCodeCash(id: number, code_cash): Promise<SavingsAccount> {
    // 1. Load existing entity
    const account = await this.repo.findOne({ 
        where: { id }, 
        relations: ['type_savings_account'] 
    });
    
    if (!account) {
        throw new NotFoundException(`Compte épargne #${id} introuvable`);
    }
    // Return empty account if conditions aren't met
    if (code_cash) {
      console.log('updateCodeCash', code_cash)
      account.code_cash = code_cash;
      await this.repo.save(account); // Added await here
    }
    return account; 

   /* try {
        const code_cash = await this.mcotiService.callMcotiEndpoint(
            'GET',
            `epargne/epargne-accounts/${account.number_savings_account}/update-code-cash`
        );

        if (code_cash) {
            account.code_cash = code_cash;
            await this.repo.save(account); // Added await here
            return account;
        }

        // Return empty account if no code_cash was returned
        return new SavingsAccount();

    } catch (error) {
        console.error('Error updating code cash:', error);
        return new SavingsAccount();
    }*/
}

  async remove(id: number): Promise<any> {
    const account = await this.repo.findOne({
      where: { id },
    });
    account!.status = SavingsAccountStatus.DEACTIVATE;
    return await account?.save();
  }

  async activate(id: number): Promise<any> {
    const account = await this.repo.findOne({
      where: { id },
    });
    account!.status = SavingsAccountStatus.ACTIVE;
    return await account?.save();
  }

  async getInitialDeposit(typeTx: any): Promise<any> {

    return this.typeSavingAcount.calculerSoldeMinimumDepot(typeTx);
  }

  async lock(id: number): Promise<any> {
    const account = await this.repo.findOne({
      where: { id },
    });
    account!.status = SavingsAccountStatus.BLOCKED;
    return await account?.save();
  }

  async unlock(id: number): Promise<any> {
    const account = await this.repo.findOne({
      where: { id },
    });
    account!.status = SavingsAccountStatus.ACTIVE;
    return await account?.save();
  }

  async balance(id: number): Promise<any> {
    const account = await this.repo.findOne({
      where: { id },
      relations: ['type_savings_account'],
    });
    if (!account) throw new NotFoundException(`Account ${id} not found`);

    const txs = await this.getTransactions(id)
    return  await this.calculateBalance(account, txs, {
      balanceType: 'total'
    });
    // return await this.calculateTotalBalance(account,txs);
  }

  async avalaibleBalance(id: number): Promise<any> {
    const account = await this.repo.findOne({
      where: { id },
      relations: ['type_savings_account'],
    });
    if (!account) throw new NotFoundException(`Account ${id} not found`);
    const txs = await this.getTransactions(id)
    return  await this.calculateBalance(account, txs, {
      balanceType: 'available'
    });
    // return await this.calculateAvailableBalance(account,txs) ;
  }
    async avalaibleBalanceOnline(id: number): Promise<any> {
    const account = await this.repo.findOne({
      where: { id },
      relations: ['type_savings_account'],
    });
    if (!account) throw new NotFoundException(`Account ${id} not found`);
    const txs = await this.getTransactions(id)
    return  await this.calculateBalance(account, txs, {
      balanceType: 'online',
      ensureNonNegative:true
    });
    // return await this.calculateAvailableBalanceOnline(account,tx) ;
  }

  async balanceByCode(number_savings_account: string): Promise<any> {
    const account = await this.repo.findOne({
      where: { number_savings_account },
      relations: ['type_savings_account'],
    });
    if (!account) throw new NotFoundException(`Account ${number_savings_account} not found`);

    const txs = await this.getTransactions(account.id)
        return  await this.calculateBalance(account, txs, {
      balanceType: 'total'
    });
    // return await this.calculateTotalBalance(account,tx);
  }

  async avalaibleBalanceByCode(number_savings_account: string): Promise<any> {
    const account = await this.repo.findOne({
      where: { number_savings_account },
      relations: ['type_savings_account'],
    });
    if (!account) throw new NotFoundException(`Account ${number_savings_account} not found`);
    const txs = await this.getTransactions(account.id)
        return  await this.calculateBalance(account, txs, {
      balanceType: 'available'
    });
    // return await this.calculateAvailableBalance(account,tx) ;
  }

  async avalaibleBalanceByCodeOnline(number_savings_account: string): Promise<any> {
    const account = await this.repo.findOne({
      where: { number_savings_account },
      relations: ['type_savings_account'],
    });
    if (!account) throw new NotFoundException(`Account ${number_savings_account} not found`);
    const txs = await this.getTransactions(account.id)
        return  await this.calculateBalance(account, txs, {
      balanceType: 'online',
      ensureNonNegative:true
    });
    // return await this.calculateAvailableBalanceOnline(account,tx) ;
  }

  async getRequiredDocuments(id: number): Promise<DocumentType[]> {
    const sa = await this.findOne(id);
    return await this.typeSavingAcount.getRequiredDocuments(sa.type_savings_account.id);
  }

  async validateAccount(id: number): Promise<SavingsAccount> {
    const account = await this.repo.findOne({ where: { id } });
    if (!account) throw new NotFoundException(`Account ${id} not found`);
    if (account.status !== SavingsAccountStatus.PENDING) {
      return account;
      // throw new BadRequestException(`Cannot validate account in status ${account.status}`);
    }
    if((await this.getDocumentStatus(id)).allRequiredValidated === true && (await this.transactionSavingsAccountService.isFirstTransaction(account))){

      account.status = SavingsAccountStatus.ACTIVE;
      // await this.mcotiService.callMcotiEndpoint('GET',`epargne/epargne-accounts/${account.number_savings_account}/validate`);
      return this.repo.save(account);
    }
    return account;
  }

  async getDocumentStatuses(id: number): Promise<{ documentId: number; name: string; status: DocumentSavingAccountStatus }[]> {
    // load account with its documents
    const account = await this.repo.findOne({
      where: { id },
      relations: ['documents'],
    });
    if (!account) throw new NotFoundException(`Account ${id} not found`);
    return account.documents.map(doc => ({
      documentId: doc.id,
      name: doc.name,
      status: doc.status,
    }));
  } 

  async getDocumentStatus(id?: number): Promise<{
      total: number;
      required: number;
      validated: number;
      pending: number;
      rejected: number;
      allRequiredValidated: boolean;
  }> {
    // Load account with its documents and related data
    const account = await this.repo.findOne({
      where: { id },
      relations: [
        'documents',
        'documents.document_type', // Assurez-vous que cette relation est correcte
        'type_savings_account',
        'type_savings_account.required_documents',
      ],
    });

    if (!account) {
      throw new NotFoundException(`Account ${id} not found`);
    }

    // Get IDs of required documents for this account type
    const requiredDocumentIds = account.type_savings_account.required_documents.map(
      (doc) => doc.id
    );

    // Initialize counters
    let validated = 0;
    let pending = 0;
    let rejected = 0;
    let required = 0;
    let allRequiredValidated = true;

    // Process each document
    const documentStatuses = account.documents.map((doc) => {
      // Check if document is required
      const isRequired = requiredDocumentIds.includes(doc.document_type.id);
       if(isRequired) {
        required++;
        
        // Update status counters
        switch (doc.status) {
          case DocumentSavingAccountStatus.ACCEPTED:
            validated++;
            break;
          case DocumentSavingAccountStatus.PENDING:
            pending++;
            allRequiredValidated = false;
            break;
          case DocumentSavingAccountStatus.REFUSED:
            rejected++;
            allRequiredValidated = false;
            break;
        }
      }

      return {
        documentId: doc.id,
        name: doc.name,
        status: doc.status,
        isRequired,
      };
    });

    return {
        total: account.documents.length,
        required,
        validated,
        pending,
        rejected,
        allRequiredValidated: required > 0 && required === validated, // Si aucun doc requis, considérer comme validé
    };
  }

  async getTransactions(id: number,): Promise<TransactionSavingsAccount[]> {
    // load account with its documents
    const account = await this.repo.findOne({
      where: { id },
      relations: ['originSavingsAccountTx' , 'targetSavingsAccountTx'],
    });
    if (!account) throw new NotFoundException(`Account ${id} not found`);
    const combinedTransactions = [
      ...(account.originSavingsAccountTx ?? []),
      ...(account.targetSavingsAccountTx ?? [])
    ];
    return combinedTransactions;
  } 

  async getTransactionsPaginate(id: number, page = 1, limit = 10,
    term?: string,
    fields?: string[],
    exact?: boolean,
    from?: string,
    to?: string, txTypeCode?: string,
    type?: string,branch_id = 0): Promise<PaginatedResult<TransactionSavingsAccount>> {
      return this.transactionSavingsAccountService.findAllByType(
                                                  page,
                                                  limit,
                                                  term,
                                                  fields,
                                                  exact,
                                                  from,
                                                  to,txTypeCode,type,id)
      if (!this.txRepo) {
        throw new Error('Transaction repository is not available');
      }

      // Verify the metadata exists
      const metadata = this.txRepo.metadata;
      console.log('Entity metadata:', metadata);
    
    // 2️⃣ Construction du QueryBuilder sur les transactions
    const qb = this.txRepo
      .createQueryBuilder('tx')
      // Jointures avec les comptes d'épargne
      .leftJoinAndSelect('tx.originSavingsAccount', 'originAccount')
      .leftJoinAndSelect('tx.targetSavingsAccount', 'targetAccount')
      // Jointures supplémentaires si nécessaires (optionnel)
      .leftJoinAndSelect('tx.channelTransaction', 'channel')
      .leftJoinAndSelect('tx.transactionType', 'type')
      // Filtre sur l'ID du compte (origine ou destination)
      .where('originAccount.id = :id OR targetAccount.id = :id', { id })
      // Tri par date de création
      .orderBy('tx.created_at', 'DESC');



    /*const options: PaginationOptions & { search?: SearchOptions; 
    dateRange?: DateRange } = { page, limit };
    if (term) options.search = { term, fields, exact };
    if (from || to) options.dateRange = { from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined };*/
    /*console.log('------options11---- ', options)
    const paginatedResult = await this.paginationService.paginate<SavingsAccount>(qb, options);
    const data = paginatedResult.data.map(account => 
      plainToInstance(SavingsAccountResponseDto, account)
    );



    // 3️⃣ Pagination via notre service
      const result: PaginatedResult<TransactionSavingsAccount> =
       await this.paginationService.paginate(qb, options);

    // 4️⃣ Retour dans le même format pour account + transactions paginées
    return result;*/
  } 

  async assign_interest_range(
    account_id: number,
    dto: AssignInterestRangeDto,
  ): Promise<any> {
    // 1. récupérer le compte
    const savings_account = await this.findOne(account_id);
  
    // 2. calculer la durée en mois
    const start = new Date(dto.start_date);
    const end = new Date(dto.end_date);
    const months =
      (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth());
    if (months < 1) {
      throw new BadRequestException('La période doit être d’au moins un mois');
    }
  
    // 3. vérifier l'existence d'un plan identique
    let plan = await this.planRepo.findOne({
      where: { duration_months: months, rate: dto.rate },
    });
    if (!plan) {
      plan = this.planRepo.create({ duration_months: months, rate: dto.rate });
      await this.planRepo.save(plan);
    }
  
    // 4. empêcher la recréation du lien actif si déjà existant
    const existingLink = await this.interestRepo.findOne({
      where: {
        savings_account: { id: account_id},
        interest_saving_account: {id: plan.id},
        status: 1,
      },
    });
    if (existingLink) {
      throw new BadRequestException('Ce plan d’intérêt est déjà actif pour ce compte');
    }
  
    // 5. créer la nouvelle liaison sans désactiver l'ancienne
    const link = this.interestRepo.create({
      savings_account,
      interest_saving_account : plan,
      begin_date: start,
      end_date: end,
      status: 1,
    });
    return [account_id, plan, existingLink]

    return this.interestRepo.save(link);
  }
  
async updateBalance(id: number): Promise<{ balance: number; avalaible_balance: number; avalaible_balance_online: number }> {
  if (!id)
    return { balance: 0, avalaible_balance: 0, avalaible_balance_online: 0 };

  let dto = new UpdateSavingsAccountDto();
  dto.balance = await this.balance(id);
  dto.avalaible_balance = await this.avalaibleBalance(id);
  dto.avalaible_balance = await this.avalaibleBalance(id);
  dto.avalaible_balance_online = await this.avalaibleBalanceOnline(id);

  await this.update(id, dto); // <-- à ne pas oublier de await

  return {
    balance: dto.balance ?? 0,
    avalaible_balance: dto.avalaible_balance ?? 0,
    avalaible_balance_online: dto.avalaible_balance_online ?? 0,
  };
}

  
  /**
  * Calcule le solde total du compte en fonction des transactions (crédits et débits)
  * @param transactions Tableau de transactions avec is_credit (1=crédit, 0=débit)
  * @returns Solde total arrondi à 2 décimales
  */
  async calculateTotalBalance(
    account: SavingsAccount,
    transactions: TransactionSavingsAccount[],
  ): Promise<number | any> {
    if (!transactions?.length) return 0;

    const acctNum = account.number_savings_account;
    const total = transactions.reduce((sum, tx) => {
      // 1. Ignorer les transactions échouées
      // console.log('originNum targetNum ', tx?.originSavingsAccount?.number_savings_account, ' ', tx?.targetSavingsAccount?.number_savings_account,' ', tx.amount, ' ',account.id);
      if (tx.status != TransactionSavingsAccountStatus.VALIDATE) {
        return sum;
      }

      // 2. Cas transfert interne complet
      if (tx.originSavingsAccount && tx.targetSavingsAccount && tx.status === TransactionSavingsAccountStatus.VALIDATE) {
        const originNum = tx.originSavingsAccount.number_savings_account;
        const targetNum = tx.targetSavingsAccount.number_savings_account;
        if (targetNum === acctNum) {
          // réception / crédit
          return sum + tx.amount;
        }
        if (originNum === acctNum) {
          if(tx.transactionType.code === 'MIN_BALANCE')
            return sum
          // envoi / débit
          return sum - tx.amount;
        }
        // transaction sans lien avec ce compte
        return sum;
      }

      // 3. Fallback sur la logique historique
      if ( tx.transactionType && tx.transactionType.is_credit === 1) {
        // crédit standard : on ne compte que si VALIDATE
        if (tx.status === TransactionSavingsAccountStatus.VALIDATE) {
          return sum + tx.amount;
        }
        return sum;
      } else {
        // débit standard
        // on ignore les dépôts initiaux marqués 'MIN_BALANCE'
        if (
          tx.transactionType.is_credit === 0 &&
          tx.transactionType.code === 'MIN_BALANCE'
        ) {
          return sum;
        }
        return sum - tx.amount;
      }
    }, 0);
    account.balance = total
    console.log('total ', total)
    await this.repo.save(account)
    return total; // ou Math.max(0, total) si vous voulez forcer ≥ 0
  }

    /**
  * Calcule le solde disponible (exclut les transactions bloquées)
  * @param transactions Tableau de transactions avec is_credit et is_locked
  * @returns Solde disponible arrondi à 2 décimales
  */
  async calculateAvailableBalance(
    account: SavingsAccount,
    transactions: TransactionSavingsAccount[],
  ): Promise<number | any> {
    if (!transactions?.length) {
      return 0;
    }

    const now = new Date();
    const available = transactions.reduce((sum, tx) => {
      const originNum = tx?.originSavingsAccount?.number_savings_account;
      const targetNum = tx?.targetSavingsAccount?.number_savings_account; 
      const acctNum = account.number_savings_account;
      // 1. Ignorer transactions verrouillées ou échouées
      if ((tx.is_locked && targetNum === acctNum) || tx.status != TransactionSavingsAccountStatus.VALIDATE) {
        // console.log('txs ',transactions.length ,' ', tx.id)
        return sum;
      }

      // 2. Cas transfert complet (origin & target présents)
      if (tx.originSavingsAccount && tx.targetSavingsAccount) {


        if (targetNum === acctNum) {
          // console.log('debit ',sum ,' ', tx.amount)
          // réception / crédit
          return sum + tx.amount;
        }
        if (originNum === acctNum) {
          // envoi / débit
          console.log('credit ',sum ,' ', tx.amount)
          return sum - tx.amount;
        }
        // si la transaction n'implique pas ce compte, on l'ignore
        return sum;
      }

      // 3. Fallback sur la logique existante
      if (tx.transactionType && tx.transactionType.is_credit === 1) {
        // crédit simple
        if (tx.status === TransactionSavingsAccountStatus.VALIDATE) {
          return sum + tx.amount;
        }
        return sum;
      } else {
        // débit simple
        return sum - tx.amount;
      }
    }, 0);

    // optionnel : ne jamais retourner un solde négatif  
    // return parseFloat(Math.max(0, available).toFixed(2));
    account.avalaible_balance = available
    await this.repo.save(account)
    console.log('total ', account.avalaible_balance)
    return available;
  }

  async calculateAvailableBalanceOnline(
    account: SavingsAccount,
    transactions: TransactionSavingsAccount[],
  ): Promise<number | any> {
    if (!transactions?.length) return 0;

    const acctNum = account.number_savings_account;
    const total = transactions.reduce((sum, tx) => {
      // 1. Ignorer les transactions échouées
      if (tx.status != TransactionSavingsAccountStatus.VALIDATE || tx.branch_id ) {
        // console.log('originNum targetNum1111 ', tx.id ,' --- ', tx.channelTransaction.code ,' --- ', tx.status != TransactionSavingsAccountStatus.VALIDATE ,"||", tx.channelTransaction.code != TransactionChannel.MOBILE, ' ----- ', tx.channelTransaction.code != TransactionChannel.MOBILE);
        return sum;
      }

      // 2. Cas transfert interne complet
      if (tx.originSavingsAccount && tx.targetSavingsAccount && tx.status === TransactionSavingsAccountStatus.VALIDATE) {
        const originNum = tx.originSavingsAccount.number_savings_account;
        const targetNum = tx.targetSavingsAccount.number_savings_account;
        if (targetNum === acctNum) {
          // réception / crédit
          return sum + tx.amount;
        }
        if (originNum === acctNum) {

          // envoi / débit
          return sum - tx.amount;
        }
        // transaction sans lien avec ce compte
        return sum;
      }

      // 3. Fallback sur la logique historique
      if ( tx.transactionType && tx.transactionType.is_credit === 1) {
        // crédit standard : on ne compte que si VALIDATE
        if (tx.status === TransactionSavingsAccountStatus.VALIDATE) {
          return sum + tx.amount;
        }
        return sum;
      } else {
        // débit standard
        return sum - tx.amount;
      }
    }, 0);
    account.avalaible_balance_online = total
    console.log('total ', total)
    await this.repo.save(account)
    return Math.max(total, 0);  
  }

  async calculateBalance(
    account: SavingsAccount,
    transactions: TransactionSavingsAccount[],
    options: {
      balanceType: 'total' | 'available' | 'online';
      ensureNonNegative?: boolean;
    }
  ): Promise<number> {
    if (!transactions?.length) return 0;

    const acctNum = account.number_savings_account;
    
    const balance = transactions.reduce((sum, tx) => {
      let commission :number = 0;
      if(tx.origin == acctNum ){
        commission = tx.commission || 0;
      }
      // console.log(commission)
      // 1. Filtrage selon le type de balance
      switch (options.balanceType) {
        case 'available':
          if (tx.status !== TransactionSavingsAccountStatus.VALIDATE  || (tx.is_locked && tx?.targetSavingsAccount?.number_savings_account === acctNum)) {
            return sum;
          }
          break;
          
        case 'online':
          if (tx.status !== TransactionSavingsAccountStatus.VALIDATE || tx.branch_id || (tx.is_locked && tx?.targetSavingsAccount?.number_savings_account === acctNum)) {
            return sum;
          }
          break;
          
        case 'total':
        default:
          if (tx.status !== TransactionSavingsAccountStatus.VALIDATE) {
            return sum;
          }
          break;
      }


      // 2. Logique de transfert interne (commune aux trois méthodes)
      if (tx.originSavingsAccount && tx.targetSavingsAccount) {
        const originNum = tx.originSavingsAccount.number_savings_account;
        const targetNum = tx.targetSavingsAccount.number_savings_account;

        if (targetNum === acctNum) return sum + tx.amount;
        if (originNum === acctNum) {
          if (options.balanceType === 'total' && tx.transactionType?.code === 'MIN_BALANCE') {
            console.log('debit ',sum ,' ', (sum | 0) + (commission | 0))
            return (sum | 0) + (commission | 0);
          }
          return sum - ((tx.amount | 0) + (commission | 0));
        }
        return sum;
      }

      // 3. Logique de crédit/débit standard
      if (tx.transactionType?.is_credit === 1) {
        return sum + ((tx.amount | 0) + (commission | 0));
      } else {
        if (options.balanceType === 'total' && tx.transactionType?.code === 'MIN_BALANCE') {
          return sum;
        }
        return sum - ((tx.amount | 0) + (commission | 0));
      }
    }, 0);

    // Mise à jour du compte selon le type de balance
    switch (options.balanceType) {
      case 'total':
        account.balance = balance;
        break;
      case 'available':
        account.avalaible_balance = balance;
        break;
      case 'online':
        account.avalaible_balance_online = balance;
        break;
    }

    await this.repo.save(account);
    console.log(`${options.balanceType} balance`, balance);
    
    return options.ensureNonNegative ? Math.max(balance, 0) : balance;
  }

async generateNextAccountNumber(type_sa: TypeSavingsAccount): Promise<string> {
  // 1) On récupère le résultat brut
  const raw = await this.repo
    .createQueryBuilder('acc')
    .select('MAX(CAST(RIGHT(acc.number_savings_account, 5) AS UNSIGNED))', 'max')
    .where('acc.number_savings_account LIKE :prefix', { prefix: `${type_sa.code}%` })
    .getRawOne<{ max: string }>();  // on indique que max arrive comme string

  // 2) On convertit en number et on gère undefined
  const maxValue = raw?.max ? parseInt(raw.max, 10) : 0;

  // 3) Calcul du prochain suffixe
  const next = maxValue + 1;

  // 4) Formatage sur 5 chiffres
  const suffix = next.toString().padStart(5, '0');

  // 5) Concaténation avec le code de la type_sae
  return `${type_sa.code}${suffix}`;
}


  async stats(id: number): Promise<any> {
    console.log('stats');

    let sa = await this.repo.findOne({where: { id }, relations: ['originSavingsAccountTx', 'targetSavingsAccountTx','originSavingsAccountTx.provider', 'targetSavingsAccountTx.provider']});
    if (!sa) throw new NotFoundException(`Compte ${id} introuvable`);

    let outgoingTransactions: TransactionSavingsAccount[] = []; 
    let incomingTransactions : TransactionSavingsAccount[] = [] 
    let outgoingTransactionsMOMO: TransactionSavingsAccount[] = []; 
    let incomingTransactionsMOMO : TransactionSavingsAccount[] = [] 
    let outgoingTransactionsOM: TransactionSavingsAccount[] = []; 
    let incomingTransactionsOM : TransactionSavingsAccount[] = [] 
    let inComingAmount = 0
    let outgoingAmount = 0
    let inComingAmountMOMO = 0
    let outgoingAmountMOMO = 0
    let inComingAmountOM = 0
    let outgoingAmountOM = 0
    if (sa.originSavingsAccountTx) {
        sa.originSavingsAccountTx?.forEach((tx) => {
          if(tx.status == 1){
            outgoingTransactions.push(tx);
            outgoingAmount += tx.amount
            if(tx.transactionType.code === TransactionCode.INTERNAL_TRANSFER ){
            }
            if(tx.channelTransaction.code === TransactionChannel.MOBILE  ){
              if(tx.provider.code === TransactionProvider.MOMO){
                outgoingTransactionsMOMO.push(tx);
                outgoingAmountMOMO += tx.amount;
              }
              else if(tx.provider.code === TransactionProvider.OM){
                outgoingTransactionsOM.push(tx);
                outgoingAmountOM += tx.amount;
              }
            }
          }
        });
    }
    if (sa.targetSavingsAccountTx) {
      sa.targetSavingsAccountTx?.forEach((tx) => {
          if(tx.status == 1){
            incomingTransactions.push(tx);
            inComingAmount += tx.amount
            if(tx.transactionType.code === TransactionCode.INTERNAL_TRANSFER ){
            }
            if(tx.channelTransaction.code === TransactionChannel.MOBILE  ){
              if(tx.provider.code === TransactionProvider.MOMO){
                incomingTransactionsMOMO.push(tx);
                inComingAmountMOMO += tx.amount;
              }
              else if(tx.provider.code === TransactionProvider.OM){
                incomingTransactionsOM.push(tx);
                inComingAmountOM += tx.amount;
              }
            }
        }

      });
    }

    return {
      outgoingTransactionsTotal: outgoingTransactions.length,
      incomingTransactionsTotal: incomingTransactions.length,
      outgoingTransactionsMOMOTotal: outgoingTransactionsMOMO.length,
      incomingTransactionsMOMOTotal: incomingTransactionsMOMO.length,
      outgoingTransactionsOMTotal: outgoingTransactionsOM.length,
      incomingTransactionsOMTotal: incomingTransactionsOM.length,
      inComingAmount,
      outgoingAmount,
      inComingAmountMOMO,
      outgoingAmountMOMO,
      inComingAmountOM,
      outgoingAmountOM,
    };

  }

  async requestLink(code){
    console.log(code)
    const sa = await this.findOneByCode(code)
    if(sa.customer && sa.customer.email){
      return this.otpService.generateOtpLink(sa.customer.email,sa.number_savings_account)
    }
    
  }

  async validateRequestLinkAccount(dto : VerifyOtpDto){ 
    // console.log(code)
    const sa = await this.findOneByCode(dto.number_saving_account)
    if(sa.customer && sa.customer.email){
      const resp = await this.otpService.validateOtpLink(sa.customer.email, dto.code)
      if(resp?.number_saving_account){
        sa.created_online = 1
        this.repo.save(sa)
      }
      return resp
    }
    
  }

  async subscribeRessourceType( ressource_type_id ,dto_res: CreateRessourceDto){
    const ressource =  await this.ressourceService.create(dto_res);
    const sA = await this.findOne(dto_res.savings_account_id)
    let dto = new CreateTransactionSavingsAccountDto();
    dto.amount = ressource.ressource_type.amount * ressource.quantity;
    dto.origin_savings_account_code = sA.number_savings_account;
    dto.branch_id = dto_res.branch_id;
    dto.ressource_id = ressource.id;
    return this.transactionSavingsAccountService.buy_ressource(dto, dto_res.channel)
    // this.transactionSavingsAccountService.deposit_cash(dto,);
  }

  async getBySavingsAccountId(savingsAccountId: number): Promise<Ressource[]> {
    return this.ressourceService.getBySavingsAccountId(savingsAccountId);
  }

  async getByIdAndSavingsAccount(id: number,  strict = true): Promise<Ressource | null> {
    const ressource = await this.ressourceService.getByIdAndSavingsAccount(id, strict);
    if (!ressource && strict) throw new NotFoundException('Ressource non trouvée pour ce compte');
    return ressource;
  }

}
