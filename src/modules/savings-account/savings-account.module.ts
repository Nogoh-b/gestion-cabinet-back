import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';










import { AgenciesModule } from '../agencies/agencies.module';
import { CustomerModule } from '../customer/customer.module';
import { DocumentsModule } from '../documents/documents.module';
import { TransactionModule } from '../transaction/transaction.module';
import { CommissionController } from './commission/commission.controller';
import { CommissionService } from './commission/commission.service';
import { Commission } from './commission/entities/commission.entity';
import { DocumentSavingAccountController } from './document-saving-account/document-saving-account.controller';
import { DocumentSavingAccountService } from './document-saving-account/document-saving-account.service';
import { DocumentSavingAccount } from './document-saving-account/entities/document-saving-account.entity';
import { InterestSavingAccount } from './interest-saving-account/entities/interest-saving-account.entity';
import { InterestSavingAccountController } from './interest-saving-account/interest-saving-account.controller';
import { InterestSavingAccountService } from './interest-saving-account/interest-saving-account.service';
import { SavingsAccountHasInterest } from './savings-account/entities/account-has-interest.entity';
import { SavingsAccount } from './savings-account/entities/savings-account.entity';
import { SavingsAccountController } from './savings-account/savings-account.controller';
import { SavingsAccountService } from './savings-account/savings-account.service';
import { SavingsAccountSubscriber } from './savings-account/savings-account.subscriber';
import { TypeHasDocument } from './type-savings-account/entities/type-has-document.entity';
import { TypeSavingsAccount } from './type-savings-account/entities/type-savings-account.entity';
import { TypeSavingsAccountController } from './type-savings-account/type-savings-account.controller';
import { TypeSavingsAccountService } from './type-savings-account/type-savings-account.service';











@Module({
  imports: [
    DocumentsModule,
    AgenciesModule,
    forwardRef(() => TransactionModule),
    forwardRef(() => CustomerModule),
    TypeOrmModule.forFeature([
      DocumentSavingAccount,
      TypeSavingsAccount,
      TypeHasDocument,
      Commission,
      InterestSavingAccount,
      SavingsAccount,
      SavingsAccountHasInterest,
    ]),
  ],
  controllers :[
      DocumentSavingAccountController,
      CommissionController,
      InterestSavingAccountController,
      TypeSavingsAccountController,
      SavingsAccountController
  ],
  providers: [
      DocumentSavingAccountService,
      TypeSavingsAccountService,
      CommissionService,
      InterestSavingAccountService,
      SavingsAccountService, SavingsAccountSubscriber
      
  ],
  exports: [
      DocumentSavingAccountService,
      TypeSavingsAccountService,
      CommissionService,
      InterestSavingAccountService,
      SavingsAccountService,
  ]
})
export class SavingsAccountModule {}
