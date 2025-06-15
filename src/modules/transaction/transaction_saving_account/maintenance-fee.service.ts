// maintenance-fee.service.ts
import { SavingsAccount } from 'src/modules/savings-account/savings-account/entities/savings-account.entity';
import { Repository } from 'typeorm';
import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';


import { TransactionType } from '../transaction_type/entities/transaction_type.entity';
import { CreateDebitTransactionSavingsAccountDto } from './dto/create-transaction_saving_account.dto';
import { TransactionSavingsAccountService } from './transaction_saving_account.service';



@Injectable()
export class MaintenanceFeeService {
  private readonly logger = new Logger(MaintenanceFeeService.name);

  constructor(
    @InjectRepository(SavingsAccount)
    private readonly savingsAccountRepo: Repository<SavingsAccount>,
    @InjectRepository(TransactionType)
    private readonly transactionTypeRepo: Repository<TransactionType>,
    private readonly transactionService: TransactionSavingsAccountService,
  ) {}

  @Cron(CronExpression.EVERY_1ST_DAY_OF_MONTH_AT_MIDNIGHT)
  async chargeMonthlyFees() {
    this.logger.log('Début du prélèvement des frais d\'entretien mensuels');
    
    const feeType = await this.transactionTypeRepo.findOne({ 
      where: { code: 'ACCOUNT_MAINTENANCE_FEE' } 
    });
    
    if (!feeType) {
      this.logger.error('Type de transaction ACCOUNT_MAINTENANCE_FEE introuvable');
      return;
    }

    const accounts = await this.savingsAccountRepo.find({
      where: { status: 1 } // Comptes actifs seulement
    });

    for (const account of accounts) {
      try {
        const feeAmount = this.calculateFee(account);
        
        // if (account.balance >= feeAmount) {
        if (true) {
          await this.chargeFee(account, feeAmount, feeType);
        } else {
          this.logger.warn(`Solde insuffisant pour le compte ${account.id}`);
        }
      } catch (error) {
        this.logger.error(`Erreur compte ${account.id}: ${error.message}`);
      }
    }

    this.logger.log('Prélèvement des frais terminé');
  }

  private calculateFee(account: SavingsAccount): number {
    // Exemple: frais fixes de 500 FCFA
    return 500;
    
    // Ou en pourcentage: 0.1% du solde
    // return account.balance * 0.001;
  }

  private async chargeFee(
    account: SavingsAccount, 
    amount: number, 
    feeType: TransactionType
  ) {
    const dto: CreateDebitTransactionSavingsAccountDto = {
      amount,
      origin_savings_account_code: account.number_savings_account,
      // target_savings_account_code: 'FEE_ACCOUNT', // Compte spécial pour les frais
      is_locked: false,

    };

    await this.transactionService.perform_transaction(
      dto,
      feeType.code,
      'SYSTEM',
      'INTERNAL'
    );

    this.logger.log(`Frais prélevés: ${amount} sur compte ${account.id}`);
  }
}