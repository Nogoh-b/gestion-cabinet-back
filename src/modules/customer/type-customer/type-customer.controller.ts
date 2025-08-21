// type-customers.controller.ts
import { Controller, Get, Post, Body, Param, Put, UseGuards } from '@nestjs/common';
import { TypeCustomersService } from './type-customer.service';
import { TypeCustomer } from './entities/type_customer.entity';
import { CreateTypeCustomerDto } from './dto/create-type_customer.dto';
import { UpdateTypeCustomerDto } from './dto/update-type_customer.dto';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AssignDocumentsToTypeDto } from 'src/modules/documents/shared/assign-documents-to-type.dto';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';

@Controller('type-customers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class TypeCustomersController {
  constructor(private readonly service: TypeCustomersService) {}

  @Post()
  @RequirePermissions('CREATE_TYPE_CUSTOMER')
  create(@Body() dto: CreateTypeCustomerDto): Promise<TypeCustomer> {
    return this.service.create(dto);
  }

  @Get()
  @RequirePermissions('GET_TYPE_CUSTOMER')
  findAll(): Promise<TypeCustomer[]> {
    return this.service.findAll();
  }

  @Get(':id')
  @RequirePermissions('GET_TYPE_CUSTOMER')
  findOne(@Param('id') id: number): Promise<TypeCustomer> {
    return this.service.findOne(id);
  }

  @Put(':id')
  @RequirePermissions('UPDATE_TYPE_CUSTOMER')
  update(
    @Param('id') id: number,
    @Body() dto: UpdateTypeCustomerDto,
  ): Promise<TypeCustomer> {
    return this.service.update(id, dto);
  }

  @Post(':id/assign-documents')
  @RequirePermissions('ASSIGN_TYPE_CUSTOMER')
  @ApiOperation({ summary: 'Assigner des documents à un type de client' })
  async assignDocuments(
    @Param('id') id: string,
    @Body() dto: AssignDocumentsToTypeDto,
  ) {
    return this.service.assignDocuments(+id, dto);
  }

  @Get(':id/documents')
  @RequirePermissions('GET_TYPE_CUSTOMER')
  @ApiOperation({
    summary: 'Récupérer les documents associés à un type de client',
  })
  // @ApiResponse({ type: TypeCustomerResponseDto })
  async getDocuments(@Param('id') id: string) {
    return this.service.findOneWithDocuments(+id);
  }
}