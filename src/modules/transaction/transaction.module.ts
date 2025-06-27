import { CoreModule } from 'src/core/core.module';
import { BullModule } from '@nestjs/bull';

import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';






import { ProviderModule } from '../provider/provider.module';
import { SavingsAccountModule } from '../savings-account/savings-account.module';
import { ChannelTransaction } from './chanel-transaction/entities/channel-transaction.entity';
import { MaintenanceProcessor } from './processors/maintenance.processor';
import { Sequence } from './transaction_saving_account/entities/sequence.entity';
import { TransactionSavingsAccount } from './transaction_saving_account/entities/transaction_saving_account.entity';
import { TransactionSavingAccountController } from './transaction_saving_account/transaction_saving_account.controller';
import { TransactionSavingsAccountService } from './transaction_saving_account/transaction_saving_account.service';
import { TransactionType } from './transaction_type/entities/transaction_type.entity';
import { TransactionTypeController } from './transaction_type/transaction_type.controller';
import { TransactionTypeService } from './transaction_type/transaction_type.service';







@Module({
  imports: [TypeOrmModule.forFeature([
    TransactionSavingsAccount,
    TransactionType,
    ChannelTransaction,
    CoreModule,
    Sequence,
    
  ]),
  BullModule.registerQueue({
    name: 'maintenance',
  }),
  forwardRef(() => SavingsAccountModule),
  ProviderModule],
  controllers: [TransactionSavingAccountController, TransactionTypeController],
  providers: [TransactionSavingsAccountService,TransactionTypeService, MaintenanceProcessor    ],
  exports: [TransactionSavingsAccountService,TransactionTypeService, MaintenanceProcessor , TypeOrmModule, BullModule],
  
})
export class TransactionModule {}
