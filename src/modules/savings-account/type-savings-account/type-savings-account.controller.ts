import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';

import { DocumentType } from 'src/modules/documents/document-type/entities/document-type.entity';
import { Controller, Get, Post, Put, Body, Param, ParseIntPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody, ApiBearerAuth } from '@nestjs/swagger';


import { CreateTypeSavingsAccountDto } from './dto/create-type-savings-account.dto';
import { UpdateTypeSavingsAccountDto } from './dto/update-type-savings-account.dto';
import { TypeSavingsAccount } from './entities/type-savings-account.entity';
import { TypeSavingsAccountService } from './type-savings-account.service';




@ApiTags('Savings Products')
@Controller('savings-products')
@ApiBearerAuth()
export class TypeSavingsAccountController {
  constructor(private readonly service: TypeSavingsAccountService) {}

  @Get()
  @ApiOperation({ summary: 'Liste tous les produits d’épargne' })
  @ApiResponse({ status: 200, type: [TypeSavingsAccount] })
  findAll(): Promise<TypeSavingsAccount[]> {
    return this.service.findAll();
  }


  @Get('online')
  @ApiOperation({ summary: 'Liste tous les produits d’épargne En ligne' })
  @ApiResponse({ status: 200, type: [TypeSavingsAccount] })
  findAllOnline(): Promise<TypeSavingsAccount[]> {
    return this.service.findAllOnline();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupère un produit d’épargne par ID' })
  @ApiParam({ name: 'id', type: Number })
  @ApiResponse({ status: 200, type: TypeSavingsAccount })
  findOne(@Param('id', ParseIntPipe) id: number): Promise<TypeSavingsAccount> {
    return this.service.findOne(id);
  }

  @Get(':id/required-documents')
  @ApiOperation({ summary: 'Liste des documents requis pour un type de compte' })
  @ApiParam({ name: 'id', description: 'ID du type de compte', type: Number })
  @ApiResponse({ status: 200, type: [DocumentType] })
  getRequiredDocuments(@Param('id', ParseIntPipe) id: number): Promise<DocumentType[]> {
    return this.service.getRequiredDocuments(id);
  }

  @Post()
  @ApiOperation({ summary: 'Crée un produit d’épargne avec documents requis' })
  @ApiBody({ type: CreateTypeSavingsAccountDto })
  @ApiResponse({ status: 201, type: TypeSavingsAccount })
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('CREATE_TYPE_SAVINGS_ACCOUNT')
    create(@Body() dto: CreateTypeSavingsAccountDto): Promise<TypeSavingsAccount> {
    return this.service.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Met à jour un produit d’épargne et ses documents requis' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: UpdateTypeSavingsAccountDto })
  @ApiResponse({ status: 200, type: TypeSavingsAccount })
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('EDIT_TYPE_SAVINGS_ACCOUNT')
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTypeSavingsAccountDto,
  ): Promise<TypeSavingsAccount> {
    return this.service.update(id, dto);
  }

  @Get(':id/deactivate')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('DELETE_TYPE_SAVINGS_ACCOUNT')
  remove( @Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }

  
  @Get(':id/activate')
  activate( @Param('id', ParseIntPipe) id: number) {
    return this.service.activate(id);
  }


}
