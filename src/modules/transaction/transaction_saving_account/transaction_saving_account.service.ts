// Service TransactionSavingsAccount - src/core-banking/providers/transaction-savings-account.service.ts
// Gère la logique métier des transactions épargne
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TransactionSavingsAccount } from './entities/transaction_saving_account.entity';
import { CreateTransactionSavingsAccountDto } from './dto/create-transaction_saving_account.dto';
import { UpdateTransactionSavingsAccountDto } from './dto/update-transaction_saving_account.dto';
import { SavingsAccountService } from 'src/modules/savings-account/savings-account/savings-account.service';
import { ProviderService } from 'src/modules/provider/provider/provider.service';
import { TransactionTypeService } from '../transaction_type/transaction_type.service';

@Injectable()
export class TransactionSavingsAccountService {
  constructor(
    @InjectRepository(TransactionSavingsAccount)
    private readonly repo: Repository<TransactionSavingsAccount>,
    private readonly savingsAccountService: SavingsAccountService,
    private readonly providerService: ProviderService,
    private readonly transactionTypeService: TransactionTypeService,
  ) {}

    // Crée une nouvelle transaction épargne
  async create(dto: CreateTransactionSavingsAccountDto): Promise<TransactionSavingsAccount> {
      const savingsAccount = await this.savingsAccountService.findOne(dto.savings_account_id);
      if (!savingsAccount) throw new NotFoundException(`SavingsAccount ${dto.savings_account_id} non trouvé`);

      /*const channelsTransaction = await this.channelsTransactionRepo.findOne({ where: { id: dto.channels_transaction_id } });
      if (!channelsTransaction) throw new NotFoundException(`ChannelsTransaction ${dto.channels_transaction_id} non trouvé`);*/

      const provider = await this.providerService.findOne(dto.provider_code );
      if (!provider) throw new NotFoundException(`Provider ${dto.provider_code} non trouvé`);

      const transactionType = await this.transactionTypeService.findOne(dto.transaction_type_id );
      if (!transactionType) throw new NotFoundException(`TransactionType ${dto.transaction_type_id} non trouvé`);

      const txn = this.repo.create({
        amount: dto.amount,
        status: 1,
        origin_code_transaction: dto.origin_code_transaction,
        external_activities_id: dto.external_activities_id,
        external_savings_account_number: dto.external_savings_account_number,
      });

      txn.savingsAccount = savingsAccount;
      // txn.channelsTransaction = channelsTransaction;
      txn.provider = provider;
      txn.transactionType = transactionType;

      return this.repo.save(txn);
    }

  // Liste toutes les transactions épargne
  findAll(): Promise<TransactionSavingsAccount[]> {
    return this.repo.find({
      relations: ['savingsAccount', 'channelsTransaction', 'provider', 'transactionType'],
    });
  }

  // Récupère une transaction par son ID
  async findOne(id: number): Promise<TransactionSavingsAccount> {
    const entity = await this.repo.findOne({
      where: { id },
      relations: ['savingsAccount', 'channelsTransaction', 'provider', 'transactionType'],
    });
    if (!entity) throw new NotFoundException(`Transaction ${id} non trouvé`);
    return entity;
  }

  // Met à jour une transaction existante
 async update(id: number, dto: UpdateTransactionSavingsAccountDto): Promise<TransactionSavingsAccount> {
    const txn = await this.findOne(id);
    Object.assign(txn, dto);

    if (dto.savings_account_id !== undefined) {
      const savingsAccount = await this.savingsAccountService.findOne( dto.savings_account_id);
      if (!savingsAccount) throw new NotFoundException(`SavingsAccount ${dto.savings_account_id} non trouvé`);
      txn.savingsAccount = savingsAccount;
    }
    /*if (dto.channels_transaction_id !== undefined) {
      const channelsTransaction = await this.channelsTransactionRepo.findOne( dto.channels_transaction_id);
      if (!channelsTransaction) throw new NotFoundException(`ChannelsTransaction ${dto.channels_transaction_id} non trouvé`);
      txn.channelsTransaction = channelsTransaction;
    }*/
    if (dto.provider_code !== undefined) {
      const provider = await this.providerService.findOne(dto.provider_code);
      if (!provider) throw new NotFoundException(`Provider ${dto.provider_code} non trouvé`);
      txn.provider = provider;
    }
    if (dto.transaction_type_id !== undefined) {
      const transactionType = await this.transactionTypeService.findOne( dto.transaction_type_id);
      if (!transactionType) throw new NotFoundException(`TransactionType ${dto.transaction_type_id} non trouvé`);
      txn.transactionType = transactionType;
    }

    return this.repo.save(txn);
  }

  // Supprime une transaction
  async remove(id: number): Promise<TransactionSavingsAccount> {
    const entity = await this.findOne(id);
    return this.repo.remove(entity);
  }
}