import { plainToInstance } from 'class-transformer';
import { DateRange, PaginatedResult, PaginationOptions, SearchOptions } from 'src/core/shared/interfaces/pagination.interface';
import { McotiService } from 'src/core/shared/services/mCoti/mcoti.service';
import { PaginationService } from 'src/core/shared/services/pagination/pagination.service';
import { BaseService } from 'src/core/shared/services/search/base.service';
import { Branch } from 'src/modules/agencies/branch/entities/branch.entity';
import { CustomersService } from 'src/modules/customer/customer/customer.service';

import { Customer } from 'src/modules/customer/customer/entities/customer.entity';




import { DocumentType } from 'src/modules/documents/document-type/entities/document-type.entity';
import { TransactionSavingsAccount, TransactionSavingsAccountStatus } from 'src/modules/transaction/transaction_saving_account/entities/transaction_saving_account.entity';



import { Not, Repository } from 'typeorm';

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';



import { DocumentSavingAccountStatus } from '../document-saving-account/document-saving-account.service';
import { InterestSavingAccount } from '../interest-saving-account/entities/interest-saving-account.entity';
import { TypeSavingsAccount } from '../type-savings-account/entities/type-savings-account.entity';
import { TypeSavingsAccountService } from '../type-savings-account/type-savings-account.service';
import { AssignInterestRangeDto, CreateSavingsAccountDto } from './dto/create-savings-account.dto';
import { SavingsAccountResponseDto } from './dto/response-savings-account.dto';
import { UpdateCodeCahOfSavingAccountDto, UpdateSavingsAccountDto } from './dto/update-savings-account.dto';
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
    private paginationService: PaginationService,
    private customerService: CustomersService,
     private readonly mcotiService: McotiService
  ) { super(); }

  getRepository(): Repository<SavingsAccount> {
    return this.repo;
  }

  async findAll(isDeactivate : boolean = false,    page?: number,
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
    .leftJoinAndSelect('sa.documents', 'documents')
    .leftJoinAndSelect('sa.interestRelations', 'interestRelations');

    // 2. Application du filtre sur le status
    qb.where(
      isDeactivate
        ? 'sa.status = :status'
        : 'sa.status != :status',
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
  async findOne(id: number): Promise<SavingsAccount> {
    const account = await this.repo.findOne({
      where: { id , status : Not(SavingsAccountStatus.DEACTIVATE)  },
      relations: [
        'customer',
        'type_savings_account',
        'type_savings_account.required_documents',
        'branch',
        'documents',
        'interestRelations',
      ],
    });
    if (!account) throw new NotFoundException(`Compte ${id} introuvable`);
    return account;
  }

  async findOneAdmin(branch_id: number = 1): Promise<SavingsAccount> {
    const account = await this.repo.findOne({
      where: { is_admin : true , status : Not(SavingsAccountStatus.DEACTIVATE) , branch_id },
      relations: [
        'customer',
        'type_savings_account',
        'branch',
        'documents',
        'interestRelations',
      ],
    });
    if (!account) throw new NotFoundException(`Compte Admin introuvable`);
    return account;
  }

    async findOneByCode(number_savings_account: string): Promise<SavingsAccount> {
    const account = await this.repo.findOne({
      where: { number_savings_account , status: Not(SavingsAccountStatus.DEACTIVATE)},
      relations: [
        'customer',
        'type_savings_account',
        'type_savings_account.required_documents',
        'branch',
        'documents',
        'interestRelations',
        'originSavingsAccountTx',
        'targetSavingsAccountTx'
      ],
    });
    if (!account) throw new NotFoundException(`Compte ${number_savings_account} introuvable`);
    return account;
  }

  async create(
    dto: CreateSavingsAccountDto,
    is_admin = false
  ): Promise<SavingsAccount> {
    if(is_admin){
      const acc = await this.repo.findOne({ where: { is_admin, branch_id: dto.branch_id  } });
      if (acc) throw new NotFoundException(`Compte dmin déjà existant`);
    }
    const branch = await this.branchRepo.findOne({ where: { id: dto.branch_id } });
    if (!branch) throw new NotFoundException(`Agence ${dto.branch_id} introuvable`);

    const customer = await this.customerRepo.findOne({ where: { id: dto.customer_id } });
    if (!customer) throw new NotFoundException(`Client ${dto.customer_id} introuvable`);

    const typeAccount = await this.typeRepo.findOne({ where: { id: dto.type_savings_account_id } });
    if (!typeAccount) throw new NotFoundException(
      `Type d'épargne ${dto.type_savings_account_id} introuvable`,
    );

    let number_savings_account: string;
    /*do {
      const rand = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
      number_savings_account = `${branch.code}${rand}`;
    } while (await this.repo.findOne({ where: { number_savings_account } }));*/
    number_savings_account = await this.generateNextAccountNumber(branch);


    let iban = `${number_savings_account}${customer.customer_code}`;
    while (await this.repo.findOne({ where: { iban } })) {
      const rand = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
      number_savings_account = `${branch.code}${rand}`;
      iban = `${customer.customer_code}${number_savings_account}`;
    }

    const account = this.repo.create({
      branch_id: dto.branch_id,
      number_savings_account,
      fee_savings: 0.0,
      amount_created: 0,
      avalaible_balance: 0,
      status: SavingsAccountStatus.PENDING,
      // code_product: dto.code_product,
      wallet_link: dto.wallet_link,
      is_admin,
      // interest_year_savings_account: dto.interest_year_savings_account,
      iban,
      account_number: number_savings_account,
      customer: { id: dto.customer_id } as Customer,
      type_savings_account: {
        id: dto.type_savings_account_id,
      } as TypeSavingsAccount,

    });

    if(dto.location_city_id){
      this.customerService.update(customer.id, {
        location_city_id: dto.location_city_id,
      });
    }

    return this.repo.save(account);
  }

  async createOnline(
    dto: CreateSavingsAccountDto,
  ): Promise<SavingsAccount> {


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

  
  async updateCodeCash(id: number, dto: UpdateCodeCahOfSavingAccountDto): Promise<SavingsAccount> {
    // 1. Charge l’entité existante
    const account = await this.repo.findOne({ where: { id }, relations: ['type_savings_account'] });
    if (!account) {
      throw new NotFoundException(`Compte épargne #${id} introuvable`);
    }
    // 3. On copie le reste des propriétés simples
    Object.assign(account, dto);
    // 4. On enregistre avec save() pour que TypeORM gère les relations
    return this.repo.save(account);
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

    const tx = await this.getTransactions(id)
    return this.calculateTotalBalance(account,tx);
  }

  async avalaibleBalance(id: number): Promise<any> {
    const account = await this.repo.findOne({
      where: { id },
      relations: ['type_savings_account'],
    });
    if (!account) throw new NotFoundException(`Account ${id} not found`);
    const tx = await this.getTransactions(id)
    return this.calculateAvailableBalance(account,tx) ;
  }

  async getRequiredDocuments(id: number): Promise<DocumentType[]> {
    const sa = await this.findOne(id);
    return await this.typeSavingAcount.getRequiredDocuments(sa.type_savings_account.id);
  }

  async validateAccount(id: number): Promise<SavingsAccount> {
    const account = await this.repo.findOne({ where: { id } });
    if (!account) throw new NotFoundException(`Account ${id} not found`);
    if (account.status !== SavingsAccountStatus.PENDING) {
      throw new BadRequestException(`Cannot validate account in status ${account.status}`);
    }
    account.status = SavingsAccountStatus.ACTIVE;
    const code_cash = await this.mcotiService.callMcotiEndpoint('GET',`epargne/epargne-accounts/${8668522}/update-code-cash`);
    account.code_cash = code_cash;
    return this.repo.save(account);
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

  async getTransactionsPaginate(id: number, page = 1, limit = 10): Promise<PaginatedResult<TransactionSavingsAccount>> {
    
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

    // 3️⃣ Pagination via notre service
      const result: PaginatedResult<TransactionSavingsAccount> =
       await this.paginationService.paginate(qb, { page, limit });

    // 4️⃣ Retour dans le même format pour account + transactions paginées
    return result;
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
  
  /**
  * Calcule le solde total du compte en fonction des transactions (crédits et débits)
  * @param transactions Tableau de transactions avec is_credit (1=crédit, 0=débit)
  * @returns Solde total arrondi à 2 décimales
  */
  calculateTotalBalance(
    account: SavingsAccount,
    transactions: TransactionSavingsAccount[],
  ): number {
    if (!transactions?.length) return 0;

    const acctNum = account.number_savings_account;
    const total = transactions.reduce((sum, tx) => {
      // 1. Ignorer les transactions échouées
      if (tx.status === TransactionSavingsAccountStatus.FAILED) {
        return sum;
      }

      // 2. Cas transfert interne complet
      if (tx.originSavingsAccount && tx.targetSavingsAccount) {
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
      if (tx.transactionType.is_credit === 1) {
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

    return total; // ou Math.max(0, total) si vous voulez forcer ≥ 0
  }

    /**
  * Calcule le solde disponible (exclut les transactions bloquées)
  * @param transactions Tableau de transactions avec is_credit et is_locked
  * @returns Solde disponible arrondi à 2 décimales
  */
  calculateAvailableBalance(
    account: SavingsAccount,
    transactions: TransactionSavingsAccount[],
  ): number {
    if (!transactions?.length) {
      return 0;
    }

    const now = new Date();
    const available = transactions.reduce((sum, tx) => {
      // 1. Ignorer transactions verrouillées ou échouées
      if (tx.is_locked || tx.status === TransactionSavingsAccountStatus.FAILED) {
        return sum;
      }

      // 2. Cas transfert complet (origin & target présents)
      if (tx.originSavingsAccount && tx.targetSavingsAccount) {
        const originNum = tx.originSavingsAccount.number_savings_account;
        const targetNum = tx.targetSavingsAccount.number_savings_account;
        const acctNum = account.number_savings_account;

        if (targetNum === acctNum) {
          // réception / crédit
          return sum + tx.amount;
        }
        if (originNum === acctNum) {
          // envoi / débit
          return sum - tx.amount;
        }
        // si la transaction n'implique pas ce compte, on l'ignore
        return sum;
      }

      // 3. Fallback sur la logique existante
      if (tx.transactionType.is_credit === 1) {
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
    return available;
  }




async generateNextAccountNumber(branch: Branch): Promise<string> {
  // 1) On récupère le résultat brut
  const raw = await this.repo
    .createQueryBuilder('acc')
    .select('MAX(CAST(RIGHT(acc.number_savings_account, 5) AS UNSIGNED))', 'max')
    .where('acc.number_savings_account LIKE :prefix', { prefix: `${branch.code}%` })
    .getRawOne<{ max: string }>();  // on indique que max arrive comme string

  // 2) On convertit en number et on gère undefined
  const maxValue = raw?.max ? parseInt(raw.max, 10) : 0;

  // 3) Calcul du prochain suffixe
  const next = maxValue + 1;

  // 4) Formatage sur 5 chiffres
  const suffix = next.toString().padStart(5, '0');

  // 5) Concaténation avec le code de la branche
  return `${branch.code}${suffix}`;
}

  


}
