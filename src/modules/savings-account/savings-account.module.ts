import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DocumentSavingAccount } from './document-saving-account/entities/document-saving-account.entity';
import { TypeSavingsAccount } from './type-savings-account/entities/type-savings-account.entity';
import { Commission } from './commission/entities/commission.entity';
import { InterestSavingAccount } from './interest-saving-account/entities/interest-saving-account.entity';
import { TypeHasDocument } from './type-savings-account/entities/type-has-document.entity';
import { SavingsAccountHasInterest } from './savings-account/entities/account-has-interest.entity';
import { SavingsAccount } from './savings-account/entities/savings-account.entity';
import { DocumentSavingAccountController } from './document-saving-account/document-saving-account.controller';
import { TypeSavingsAccountController } from './type-savings-account/type-savings-account.controller';
import { CommissionController } from './commission/commission.controller';
import { InterestSavingAccountController } from './interest-saving-account/interest-saving-account.controller';
import { SavingsAccountController } from './savings-account/savings-account.controller';
import { DocumentSavingAccountService } from './document-saving-account/document-saving-account.service';
import { TypeSavingsAccountService } from './type-savings-account/type-savings-account.service';
import { CommissionService } from './commission/commission.service';
import { InterestSavingAccountService } from './interest-saving-account/interest-saving-account.service';
import { SavingsAccountService } from './savings-account/savings-account.service';
import { DocumentsModule } from '../documents/documents.module';
import { CustomerModule } from '../customer/customer.module';
import { AgenciesModule } from '../agencies/agencies.module';

@Module({
  imports: [
    DocumentsModule,
    AgenciesModule,
    CustomerModule,
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
      SavingsAccountController,
  ],
  providers: [
      DocumentSavingAccountService,
      TypeSavingsAccountService,
      CommissionService,
      InterestSavingAccountService,
      SavingsAccountService,
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
