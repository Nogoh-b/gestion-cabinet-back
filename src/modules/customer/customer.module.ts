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
import { CustomerWriteHandler } from './customer/customer-write.handler';
import { WriteHandlerRegistry } from 'src/core/ai-database/write/write-handler.registry';
import { AiDatabaseModule } from 'src/core/ai-database/ai-database.module';

@Module({
  imports: [
    forwardRef(() => DocumentsModule),
    AgenciesModule,
    GeographyModule,
    TypeOrmModule.forFeature([TypeCustomer, Customer, DocumentType]),
    AiDatabaseModule,
  ],
  controllers: [TypeCustomersController, CustomerController],
  providers: [
    TypeCustomersService,
    CustomersService,
    BranchService,
    CustomerStatsService,
    TypeCustomerStatsService,
    CustomerWriteHandler,
  ],
  exports: [TypeCustomersService, CustomersService, TypeOrmModule, CustomerStatsService, TypeCustomerStatsService],
})
export class CustomerModule {
  constructor(
    private readonly registry: WriteHandlerRegistry,
    private readonly handler: CustomerWriteHandler,
  ) {}

  onModuleInit() {
    this.registry.register(this.handler);
  }
}
