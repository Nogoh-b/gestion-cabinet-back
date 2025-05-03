// type-customers.controller.ts
import { Controller, Get, Post, Body, Param, Put } from '@nestjs/common';
import { TypeCustomersService } from './type-customer.service';
import { TypeCustomer } from './entities/type_customer.entity';
import { CreateTypeCustomerDto } from './dto/create-type_customer.dto';
import { UpdateTypeCustomerDto } from './dto/update-type_customer.dto';
import { ApiOperation } from '@nestjs/swagger';
import { AssignDocumentsToTypeDto } from 'src/modules/documents/shared/assign-documents-to-type.dto';

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

  @Post(':id/assign-documents')
  @ApiOperation({ summary: 'Assigner des documents à un type de client' })
  async assignDocuments(
    @Param('id') id: string,
    @Body() dto: AssignDocumentsToTypeDto
  ) {
    return this.service.assignDocuments(+id, dto);
  }

  @Get(':id/documents')
  @ApiOperation({ summary: 'Récupérer les documents associés à un type de client' })
  // @ApiResponse({ type: TypeCustomerResponseDto })
  async getDocuments(@Param('id') id: string) {
    return this.service.findOneWithDocuments(+id);
  }
}