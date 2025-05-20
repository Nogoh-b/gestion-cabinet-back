import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CreateSavingsAccountDto } from './dto/create-savings-account.dto';
import { UpdateSavingsAccountDto } from './dto/update-savings-account.dto';
import { SavingsAccount, SavingsAccountStatus } from './entities/savings-account.entity';
import { BaseService } from 'src/core/shared/services/search/base.service';
import { Branch } from 'src/modules/agencies/branch/entities/branch.entity';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { TypeSavingsAccount } from '../type-savings-account/entities/type-savings-account.entity';
import { TypeSavingsAccountService } from '../type-savings-account/type-savings-account.service';
import { DocumentType } from 'src/modules/documents/document-type/entities/document-type.entity';
import { DocumentSavingAccountStatus } from '../document-saving-account/document-saving-account.service';

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
    private typeSavingAcount : TypeSavingsAccountService
  ) { super(); }

  getRepository(): Repository<SavingsAccount> {
    return this.repo;
  }

  async findAll(): Promise<SavingsAccount[]> {
    return this.repo.find({
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
      where: { id },
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

    async update(id: number,  dto: UpdateSavingsAccountDto): Promise<SavingsAccount> {
    await this.repo.update({ id }, dto);
    return this.findOne(id);
  }

  async remove(id: number): Promise<void> {
    await this.repo.delete({ id });
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

  /*async assignInterest(
    id: number,
    branch_id: number,
    dto: AssignInterestDto,
  ): Promise<SavingsAccountHasInterest> {
    const account = await this.findOne(id, branch_id);
    await this.interestRepo.update(
      { savings_account_id: id, status: 1 },
      { status: 0, end_date: new Date() },
    );

    const plan = await this.planRepo.findOne({ where: { id: dto.interest_saving_account_id } });
    if (!plan) throw new NotFoundException(`Plan ${dto.interest_saving_account_id} introuvable`);

    const link = this.interestRepo.create({
      savings_account_id: id,
      interest_saving_account_id: dto.interest_saving_account_id,
      begin_date: new Date(),
      status: 1,
    });
    return this.interestRepo.save(link);
  }*/

}
