import { forwardRef, Module } from '@nestjs/common';
import { CustomerController } from './customer/customer.controller';
import { CustomersService } from './customer/customer.service';
import { TypeCustomersService } from './type-customer/type-customer.service';
import { TypeCustomersController } from './type-customer/type-customer.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeCustomer } from './type-customer/entities/type_customer.entity';
import { Customer } from './customer/entities/customer.entity';
import { DocumentType } from '../documents/document-type/entities/document-type.entity';
import { GeographyModule } from '../geography/geography.module';
import { DocumentsModule } from '../documents/documents.module';
import { AgenciesModule } from '../agencies/agencies.module';

@Module({
  imports: [
    GeographyModule,
    AgenciesModule,
    forwardRef(() => DocumentsModule),
    TypeOrmModule.forFeature([TypeCustomer, Customer, DocumentType]),
  ],
  controllers: [TypeCustomersController, CustomerController],
  providers: [TypeCustomersService, CustomersService],
  exports: [TypeCustomersService, CustomersService, TypeOrmModule],
})
export class CustomerModule {}
