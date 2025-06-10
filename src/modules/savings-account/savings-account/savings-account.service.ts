import { BaseService } from 'src/core/shared/services/search/base.service';
import { Branch } from 'src/modules/agencies/branch/entities/branch.entity';
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
    @InjectRepository(SavingsAccountHasInterest)
    private readonly interestRepo: Repository<SavingsAccountHasInterest>, 
    private typeSavingAcount : TypeSavingsAccountService
  ) { super(); }

  getRepository(): Repository<SavingsAccount> {
    return this.repo;
  }

  async findAll(isDeactivate : boolean = false): Promise<SavingsAccount[]> {
    return this.repo.find({ where : {status: isDeactivate ? SavingsAccountStatus.DEACTIVATE : Not(SavingsAccountStatus.DEACTIVATE) },
      relations: [
        'customer',
        'type_savings_account',
        'branch',
        'documents',
        'interestRelations',
      ],
    });
  }

  async findOne(id: number): Promise<SavingsAccount> {
    const account = await this.repo.findOne({
      where: { id , status : Not(SavingsAccountStatus.DEACTIVATE)  },
      relations: [
        'customer',
        'type_savings_account',
        'branch',
        'documents',
        'interestRelations',
      ],
    });
    if (!account) throw new NotFoundException(`Compte ${id} introuvable`);
    return account;
  }

    async findOneByCode(number_savings_account: string): Promise<SavingsAccount> {
    const account = await this.repo.findOne({
      where: { number_savings_account , status: Not(SavingsAccountStatus.DEACTIVATE)},
      relations: [
        'customer',
        'type_savings_account',
        'branch',
        'documents',
        'interestRelations',
        'originSavingsAccount',
        'targetSavingsAccount'
      ],
    });
    if (!account) throw new NotFoundException(`Compte ${number_savings_account} introuvable`);
    return account;
  }

  async create(
    dto: CreateSavingsAccountDto,
  ): Promise<SavingsAccount> {
    const branch = await this.branchRepo.findOne({ where: { id: dto.branch_id } });
    if (!branch) throw new NotFoundException(`Agence ${dto.branch_id} introuvable`);

    const customer = await this.customerRepo.findOne({ where: { id: dto.customer_id } });
    if (!customer) throw new NotFoundException(`Client ${dto.customer_id} introuvable`);

    const typeAccount = await this.typeRepo.findOne({ where: { id: dto.type_savings_account_id } });
    if (!typeAccount) throw new NotFoundException(
      `Type d'épargne ${dto.type_savings_account_id} introuvable`,
    );

    let number_savings_account: string;
    do {
      const rand = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
      number_savings_account = `${branch.code}${rand}`;
    } while (await this.repo.findOne({ where: { number_savings_account } }));

    let iban = `${customer.customer_code}${number_savings_account}`;
    while (await this.repo.findOne({ where: { iban } })) {
      const rand = Math.floor(Math.random() * 100000).toString().padStart(5, '0');
      number_savings_account = `${branch.code}${rand}`;
      iban = `${customer.customer_code}${number_savings_account}`;
    }

    const account = this.repo.create({
      branch_id: dto.branch_id,
      number_savings_account,
      // fee_savings: dto.fee_savings,
      // amount_created: dto.amount_created,
      // balance_init_savings_account: dto.balance_init_savings_account,
      status: dto.status,
      code_product: dto.code_product,
      wallet_link: dto.wallet_link,
      // interest_year_savings_account: dto.interest_year_savings_account,
      iban,
      account_number: number_savings_account,
      customer: { id: dto.customer_id } as Customer,
      type_savings_account: { id: dto.type_savings_account_id } as TypeSavingsAccount,
    });

    return this.repo.save(account);
  }

  async save(sa_s : SavingsAccount[]): Promise<any> {
    await this.repo.save(sa_s);
    return sa_s;
  }

  async update(id: number,  dto: UpdateSavingsAccountDto): Promise<SavingsAccount> {
    await this.repo.update({ id }, dto);
    return this.findOne(id);
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
    return this.calculateTotalBalance(tx);
  }

  async avalaibleBalance(id: number): Promise<any> {
    const account = await this.repo.findOne({
      where: { id },
      relations: ['type_savings_account'],
    });
    if (!account) throw new NotFoundException(`Account ${id} not found`);
    const tx = await this.getTransactions(id)
    return this.calculateAvailableBalance(tx) ;
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

  async getTransactions(id: number,): Promise<TransactionSavingsAccount[]> {
    // load account with its documents
    const account = await this.repo.findOne({
      where: { id },
      relations: ['originSavingsAccount' , 'targetSavingsAccount'],
    });
    if (!account) throw new NotFoundException(`Account ${id} not found`);
    const combinedTransactions = [
      ...(account.originSavingsAccount ?? []),
      ...(account.targetSavingsAccount ?? [])
    ];
    return combinedTransactions;
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
  calculateTotalBalance(transactions: TransactionSavingsAccount[]): number {
      if (!transactions?.length) return 0;
      
      const total = transactions.reduce((sum, transaction) => {
          // Ignorer les transactions échouées
          if (transaction.status === TransactionSavingsAccountStatus.FAILED) {
              return sum;
          }

          if (transaction.transactionType.is_credit === 1) {
              // CRÉDIT : seulement les transactions VALIDÉES comptent
              if (transaction.status === TransactionSavingsAccountStatus.VALIDATE) {
                  return sum + transaction.amount;
              }
              return sum;
          } else {
              // DÉBIT : toutes les transactions non-échouées comptent (PENDING ou VALIDATE)
              return sum - transaction.amount;
          }
      }, 0);

      return parseFloat(Math.max(0, total).toFixed(2));
  }
    /**
  * Calcule le solde disponible (exclut les transactions bloquées)
  * @param transactions Tableau de transactions avec is_credit et is_locked
  * @returns Solde disponible arrondi à 2 décimales
  */
  calculateAvailableBalance(transactions: TransactionSavingsAccount[]): number {
      if (!transactions?.length) return 0;
      
      const available = transactions.reduce((sum, transaction) => {
          // Ignorer les transactions verrouillées ou échouées
          if (transaction.is_locked || transaction.status === TransactionSavingsAccountStatus.FAILED) {
              return sum;
          }

          if (transaction.transactionType.is_credit === 1) {
              // CRÉDIT : seulement les transactions VALIDÉES comptent
              if (transaction.status === TransactionSavingsAccountStatus.VALIDATE) {
                  return sum + transaction.amount;
              }
              return sum;
          } else {
              // DÉBIT : toutes les transactions non-échouées comptent (PENDING ou VALIDATE)
              return sum - transaction.amount;
          }
      }, 0);

      return parseFloat(Math.max(0, available).toFixed(2));
  }
}
