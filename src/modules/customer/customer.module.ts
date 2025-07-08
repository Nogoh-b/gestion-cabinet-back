import { CoreModule } from 'src/core/core.module';
import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';






import { AgenciesModule } from '../agencies/agencies.module';
import { BranchService } from '../agencies/branch/branch.service';
import { DocumentType } from '../documents/document-type/entities/document-type.entity';
import { DocumentsModule } from '../documents/documents.module';
import { GeographyModule } from '../geography/geography.module';
import { IamModule } from '../iam/iam.module';
import { SavingsAccountModule } from '../savings-account/savings-account.module';
import { CustomerController } from './customer/customer.controller';
import { CustomersService } from './customer/customer.service';
import { Customer } from './customer/entities/customer.entity';
import { TypeCustomer } from './type-customer/entities/type_customer.entity';
import { TypeCustomersController } from './type-customer/type-customer.controller';
import { TypeCustomersService } from './type-customer/type-customer.service';







@Module({
  imports: [
    GeographyModule,
    CoreModule,
    IamModule,
    forwardRef(() => AgenciesModule),
    forwardRef(() => DocumentsModule),
    forwardRef(() => SavingsAccountModule), 
    TypeOrmModule.forFeature([TypeCustomer, Customer, DocumentType]),
  ],
  controllers: [TypeCustomersController, CustomerController],
  providers: [TypeCustomersService, CustomersService, BranchService],
  exports: [TypeCustomersService, CustomersService, TypeOrmModule],
})
export class CustomerModule {}
