// Service TransactionSavingsAccount - src/core-banking/providers/transaction-savings-account.service.ts
// Gère la logique métier des transactions épargne
import * as crypto from 'crypto';
import { ProviderService } from 'src/modules/provider/provider/provider.service';
import { SavingsAccount } from 'src/modules/savings-account/savings-account/entities/savings-account.entity';
import { SavingsAccountService } from 'src/modules/savings-account/savings-account/savings-account.service';
import { Repository } from 'typeorm';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';

import { InjectRepository } from '@nestjs/typeorm';


import { ChannelTransaction } from '../chanel-transaction/entities/channel-transaction.entity';
import { TransactionTypeService } from '../transaction_type/transaction_type.service';
import { CreateTransactionSavingsAccountDto } from './dto/create-transaction_saving_account.dto';
import { Sequence } from './entities/sequence.entity';
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
    const paymentCode = await this.generateUniquePaymentCode();
    const reference = this.formatTransactionReference(txType.code);
    // création de l'entité transaction
    const tx = new TransactionSavingsAccount();
    tx.amount = dto.amount;
    tx.is_locked = dto.is_locked
    tx.status = 0;
    tx.channelTransaction = channel;
    tx.provider = provider;
    tx.transactionType = txType;
    tx.originSavingsAccount = origin;
    tx.targetSavingsAccount = target;
    tx.payment_code = paymentCode;
    tx.reference = reference;
    // mise à jour des soldes
      await this.repo.manager.transaction(async (entityManager) => {
      await this.validateTransaction(origin, target, dto.amount); // Lancer une exception si échec

      // Débit du compte source
      origin.balance -= dto.amount;
      await entityManager.save(origin);

      // Crédit du compte cible
      target.balance += dto.amount;
      await entityManager.save(target);

      // Sauvegarde de la transaction
      await entityManager.save(tx);
    });
    return tx

  }

  deposit_cash(dto: CreateTransactionSavingsAccountDto) {
    return this.perform_transaction(dto, 'CASH_DEPOSIT', 'BRANCH', 'CASH');
  }

  deposit_cash_online(dto: CreateTransactionSavingsAccountDto) {
    return this.perform_transaction(dto, 'CASH_DEPOSIT', 'BRANCH', 'CASH');
  }

  deposit_cash_online_blocking(dto: CreateTransactionSavingsAccountDto) {
    dto.is_locked = true
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

  async validateTransaction(account: SavingsAccount, target: SavingsAccount, amount: number) {
    // const account = await this.savingsAccountService.findOne(accountId);
    if (account.balance < amount) {
      throw new BadRequestException('Solde insuffisant');
    }

    // On suppose que `account.activeInterest` a déjà été calculé via @AfterLoad()
    const active = account.activeInterest;

    // 1. Si aucune relation d’intérêt active n’est trouvée, on rejette
    if (active) {
      throw new BadRequestException('Durée de blocage non atteinte vous ne pouvez rien retiré');
    }
    // 3. Valide que les comptes sont différents
    if (account.id === target.id) {
      throw new BadRequestException('Transfert vers le même compte interdit');
    }
    // 1. Vérifier si le compte est actif
    if (account.status === 0) {
      throw new BadRequestException('Ce compte est inactif.');
    }

    // 2. Vérifier le solde minimum (pour les retraits)
    if (account.balance - amount < account.type_savings_account.minimum_balance) {
      throw new Error(`Solde insuffisant. Minimum requis: ${account.type_savings_account.minimum_balance}`);
    }

    // 3. Vérifier la durée de blocage (ex: 6 mois)
    const accountAgeMonths = this.getAccountAgeMonths(account.type_savings_account.created_at);
    if (accountAgeMonths < account.type_savings_account.minimum_blocking_duration) {
      throw new Error(`Durée de blocage non atteinte (${account.type_savings_account.minimum_blocking_duration} mois requis)`);
    }

    // 4. Calculer les frais (ex: commission_per_product devenu account_opening_fee)
    const totalFees = account.type_savings_account.account_opening_fee; // + autres frais si besoin
    return { isValid: true, fees: totalFees };
  }

  private getAccountAgeMonths(createdAt: Date): number {
    const today = new Date();
    const months = (today.getFullYear() - createdAt.getFullYear()) * 12;
    return months + today.getMonth() - createdAt.getMonth();
  }

  async validate(id: number,): Promise<TransactionSavingsAccount> {
    const entity = await this.findOne(id);
    entity.status = 1;
    return this.repo.save(entity);
  }


  // Supprime une transaction
  async remove(id: number): Promise<TransactionSavingsAccount> {
    const entity = await this.findOne(id);
    return this.repo.remove(entity);
  }

  private getMonthsBetween(start: Date, end: Date): number {
    const startYear  = start.getFullYear();
    const endYear    = end.getFullYear();
    const startMonth = start.getMonth();
    const endMonth   = end.getMonth();

    return (endYear - startYear) * 12 + (endMonth - startMonth);
  }

  // Méthode pour générer un payment_code unique
private async generateUniquePaymentCode(): Promise<string> {
  let isUnique = false;
  let paymentCode: string;
  let attempts = 0;

  do {
    paymentCode = crypto.randomBytes(8).toString('hex').toUpperCase();
    const exists = await this.repo.findOne({ where: { payment_code: paymentCode } });
    isUnique = !exists;
    attempts++;

    if (attempts > 5) {
      throw new Error('Impossible de générer un code de paiement unique');
    }
  } while (!isUnique);

  return paymentCode;
}

// Méthode pour formater la référence
private formatTransactionReference(typeCode: string): string {
  const now = new Date();
  const prefix = typeCode.substring(0, 2).toUpperCase();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = String(now.getFullYear()).substring(2);
  
  // Génération du suffixe numérique unique
  const suffix = this.generateDailySequence(); // Implémentez cette méthode
  
  return `${prefix}${day}${month}${year}${suffix}`;
}

  private async generateDailySequence(): Promise<string> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  await this.repo.manager.transaction(async (entityManager) => {
    await entityManager
      .createQueryBuilder()
      .insert()
      .into(Sequence)
      .values({ date: today, value: 1 })
      .orUpdate(['value'], ['date'])
      .execute();

    await entityManager
      .createQueryBuilder()
      .update(Sequence)
      .set({ value: () => 'value + 1' })
      .where('date = :today', { today })
      .execute();
  });

  const sequence = await this.repo.manager.findOne(Sequence, {
    where: { date: today }
  });

  return String(sequence!.value).padStart(5, '0');
}


}