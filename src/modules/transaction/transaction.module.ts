import { Module } from '@nestjs/common';
import { TransactionTypeService } from './transaction_type/transaction_type.service';
import { TransactionSavingAccountController } from './transaction_saving_account/transaction_saving_account.controller';
import { TransactionTypeController } from './transaction_type/transaction_type.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TransactionType } from './transaction_type/entities/transaction_type.entity';
import { TransactionSavingsAccountService } from './transaction_saving_account/transaction_saving_account.service';
import { TransactionSavingsAccount } from './transaction_saving_account/entities/transaction_saving_account.entity';

@Module({
  imports: [TypeOrmModule.forFeature([
    TransactionSavingsAccount,
    TransactionType,
  ])],
  controllers: [TransactionSavingAccountController, TransactionTypeController],
  providers: [TransactionSavingsAccountService,TransactionTypeService],
  exports: [TransactionSavingsAccountService,TransactionTypeService, TypeOrmModule],
  
})
export class TransactionModule {}
