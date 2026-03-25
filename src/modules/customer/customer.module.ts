import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AgenciesModule } from '../agencies/agencies.module';
import { BranchService } from '../agencies/branch/branch.service';
import { DocumentType } from '../documents/document-type/entities/document-type.entity';
import { GeographyModule } from '../geography/geography.module';
import { CustomerController } from './customer/customer.controller';
import { CustomersService } from './customer/customer.service';
import { Customer } from './customer/entities/customer.entity';
import { TypeCustomer } from './type-customer/entities/type_customer.entity';
import { TypeCustomersController } from './type-customer/type-customer.controller';
import { TypeCustomersService } from './type-customer/type-customer.service';
import { DocumentsModule } from '../documents/documents.module';
import { CustomerStatsService } from './customer/customer-stats.service';
import { TypeCustomerStatsService } from './type-customer/type-customer-stats.service';
@Module({
  imports: [
    
    // forwardRef(() => IamModule),
    forwardRef(() => DocumentsModule),
    AgenciesModule, // Import direct
    GeographyModule, // Import direct  
    TypeOrmModule.forFeature([TypeCustomer, Customer, DocumentType]),
  ],
  controllers: [TypeCustomersController, CustomerController],
  providers: [TypeCustomersService, CustomersService, BranchService, CustomerStatsService, TypeCustomerStatsService],
  exports: [TypeCustomersService, CustomersService, TypeOrmModule, CustomerStatsService, TypeCustomerStatsService],
})
export class CustomerModule {}
