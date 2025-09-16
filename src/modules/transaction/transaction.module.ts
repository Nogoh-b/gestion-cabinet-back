import { CoreModule } from 'src/core/core.module';
import { BullModule } from '@nestjs/bull';

import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';



















import { CommercialModule } from '../commercial/commercial.module';
import { PartnerModule } from '../partner/partner.module';
import { PersonnelModule } from '../personnel/personnel.module';
import { ProviderModule } from '../provider/provider.module';
import { QueueModule } from '../queue/queue.module';
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
import { TransactionTypeSeeder } from './transaction_type/transaction-type.seeder';
import { TransactionSavingsAccountSubscriber } from './transaction_saving_account/transaction_saving_account.subscriber';
import { TransactionDisputeController } from './transaction-dispute/transaction-dispute.controller';
import { TransactionDisputeService } from './transaction-dispute/transaction-dispute.service';
import { TransactionDispute } from './transaction-dispute/entities/transaction-dispute.entity';










@Module({
  imports: [
    
    forwardRef(() => CoreModule)
  
  ,TypeOrmModule.forFeature([
    TransactionSavingsAccount,
    TransactionType,
    TransactionDispute,
    ChannelTransaction,
    Sequence,
    
  ]),
    
  BullModule.registerQueue({
    name: 'maintenance',
  }),
  forwardRef(() => SavingsAccountModule),
  forwardRef(() => QueueModule),
  forwardRef(() => PartnerModule),
  forwardRef(() => CommercialModule),
  forwardRef(() => PersonnelModule),
  ProviderModule],
  controllers: [TransactionSavingAccountController, TransactionTypeController, TransactionDisputeController],
  providers: [TransactionSavingsAccountService,TransactionTypeService, MaintenanceProcessor ,  TransactionTypeSeeder, 
    TransactionSavingsAccountSubscriber  , TransactionDisputeService  ],
  exports: [TransactionDisputeService ,TransactionSavingsAccountService,TransactionTypeService, MaintenanceProcessor , TypeOrmModule, BullModule  ],
  
})
export class TransactionModule {}
