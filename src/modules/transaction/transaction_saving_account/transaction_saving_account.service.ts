// Service TransactionSavingsAccount - src/core-banking/providers/transaction-savings-account.service.ts
// Gère la logique métier des transactions épargne
import { ProviderService } from 'src/modules/provider/provider/provider.service';
import { SavingsAccountService } from 'src/modules/savings-account/savings-account/savings-account.service';
import { Repository } from 'typeorm';
import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';





import { ChannelTransaction } from '../chanel-transaction/entities/channel-transaction.entity';
import { TransactionTypeService } from '../transaction_type/transaction_type.service';
import { CreateTransactionSavingsAccountDto } from './dto/create-transaction_saving_account.dto';
import { TransactionSavingsAccount } from './entities/transaction_saving_account.entity';






@Injectable()
export class TransactionSavingsAccountService {
  constructor(
    @InjectRepository(TransactionSavingsAccount)
    private readonly repo: Repository<TransactionSavingsAccount>,
    @InjectRepository(ChannelTransaction)
    private readonly channelRepo: Repository<ChannelTransaction>,
    private readonly savingsAccountService: SavingsAccountService,
    private readonly providerService: ProviderService,
    private readonly transactionTypeService: TransactionTypeService,
  ) {}

  private async perform_transaction(
    dto: CreateTransactionSavingsAccountDto,
    type_code: string,
    channel_code: string,
    provider_code: string,
  ): Promise<TransactionSavingsAccount> {
    // récupération du compte origine
    const origin = await this.savingsAccountService.findOneByCode(
      dto.origin_savings_account_code,
    );
    if (!origin) {
      throw new NotFoundException(
        `Compte épargne introuvable pour code : ${dto.origin_savings_account_code}`,
      );
    }

    // récupération du compte cible
    const target = await this.savingsAccountService.findOneByCode(
      dto.target_savings_account_code ?? '0',
    );
    if (!target) {
      throw new NotFoundException(
        `Compte cible introuvable pour code : ${dto.target_savings_account_code}`,
      );
    }

    // récupération du type, du canal et du provider
    const txType = await this.transactionTypeService.findOneByCode(type_code);
    if (!txType) {
      throw new NotFoundException(`Type transaction invalide : ${type_code}`);
    }

    const channel = await this.channelRepo.findOne({ where: { code: channel_code } });
    if (!channel) {
      throw new NotFoundException(`Canal invalide : ${channel_code}`);
    }

    const provider = await this.providerService.findOne(provider_code);
    if (!provider) {
      throw new NotFoundException(`Provider invalide : ${provider_code}`);
    }

    // création de l'entité transaction
    const tx = new TransactionSavingsAccount();
    tx.amount = dto.amount;
    tx.status = 1;
    tx.channelTransaction = channel;
    tx.provider = provider;
    tx.transactionType = txType;
    tx.originSavingsAccount = origin;
    tx.targetSavingsAccount = target;

    // mise à jour des soldes
    if (txType.is_credit) {
      target.balance += dto.amount;
    } else {
      origin.balance -= dto.amount;
    }

    // sauvegarde des deux comptes puis de la transaction
    await this.savingsAccountService.save([origin]);
    await this.savingsAccountService.save([target]);
    return this.repo.save(tx);
  }

  deposit_cash(dto: CreateTransactionSavingsAccountDto) {
    return this.perform_transaction(dto, 'CASH_DEPOSIT', 'BRANCH', 'CASH');
  }

  withdraw_cash(dto: CreateTransactionSavingsAccountDto) {
    return this.perform_transaction(dto, 'CASH_WITHDRAWAL', 'ATM', 'CASH');
  }

  deposit_cheque(dto: CreateTransactionSavingsAccountDto) {
    return this.perform_transaction(dto, 'CHEQUE_DEPOSIT', 'BRANCH', 'CHEQUE');
  }

  credit_interest(dto: CreateTransactionSavingsAccountDto) {
    return this.perform_transaction(dto, 'INTEREST_CREDIT', 'API', 'SYSTEM');
  }

  e_wallet_deposit(dto: CreateTransactionSavingsAccountDto) {
    return this.perform_transaction(dto, 'E_WALLET_DEPOSIT', 'API', 'E_WALLET');
  }

  e_wallet_withdrawal(dto: CreateTransactionSavingsAccountDto) {
    return this.perform_transaction(dto, 'E_WALLET_WITHDRAWAL', 'API', 'E_WALLET');
  }

  async internal_transfer(dto: CreateTransactionSavingsAccountDto): Promise<TransactionSavingsAccount> {
    // maniere speciale pour virement interne
    return this.perform_transaction(dto, 'INTERNAL_TRANSFER', 'API', 'INTERNAL');
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
 /*async update(id: number, dto: UpdateTransactionSavingsAccountDto): Promise<TransactionSavingsAccount> {
    const txn = await this.findOne(id);
    Object.assign(txn, dto);

    if (dto.savings_account_id !== undefined) {
      const savingsAccount = await this.savingsAccountService.findOne( dto.savings_account_id);
      if (!savingsAccount) throw new NotFoundException(`SavingsAccount ${dto.savings_account_id} non trouvé`);
      txn.savingsAccount = savingsAccount;
    }
    // if (dto.channels_transaction_id !== undefined) {
    //   const channelsTransaction = await this.channelsTransactionRepo.findOne( dto.channels_transaction_id);
    //   if (!channelsTransaction) throw new NotFoundException(`ChannelsTransaction ${dto.channels_transaction_id} non trouvé`);
    //   txn.channelsTransaction = channelsTransaction;
    // }
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
  }*/

  // Supprime une transaction
  async remove(id: number): Promise<TransactionSavingsAccount> {
    const entity = await this.findOne(id);
    return this.repo.remove(entity);
  }
}