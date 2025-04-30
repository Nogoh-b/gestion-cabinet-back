import { Module } from '@nestjs/common';
import { CustomerController } from './customer/customer.controller';
import { CustomersService } from './customer/customer.service';
import { TypeCustomersService } from './type-customer/type-customer.service';
import { TypeCustomersController } from './type-customer/type-customer.controller';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TypeCustomer } from './type-customer/entities/type_customer.entity';
import { Customer } from './customer/entities/customer.entity';

@Module({
  imports: [TypeOrmModule.forFeature([TypeCustomer,Customer]),],
    controllers: [ TypeCustomersController, CustomerController],
     providers:[TypeCustomersService, CustomersService],

})
export class CustomerModule {}
