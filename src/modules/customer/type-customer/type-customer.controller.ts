// type-customers.controller.ts
import { Controller, Get, Post, Body, Param, Put } from '@nestjs/common';
import { TypeCustomersService } from './type-customer.service';
import { TypeCustomer } from './entities/type_customer.entity';
import { CreateTypeCustomerDto } from './dto/create-type_customer.dto';
import { UpdateTypeCustomerDto } from './dto/update-type_customer.dto';

@Controller('type-customers')
export class TypeCustomersController {
  constructor(private readonly service: TypeCustomersService) {}

  @Post()
  create(@Body() dto: CreateTypeCustomerDto): Promise<TypeCustomer> {
    return this.service.create(dto);
  }

  @Get()
  findAll(): Promise<TypeCustomer[]> {
    return this.service.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: number): Promise<TypeCustomer> {
    return this.service.findOne(id);
  }

  @Put(':id')
  update(@Param('id') id: number, @Body() dto: UpdateTypeCustomerDto): Promise<TypeCustomer> {
    return this.service.update(id, dto);
  }
/*
  @Delete(':id')
  remove(@Param('id') id: number): Promise<void> {
    return this.service.remove(id);
  }*/
}