import { Controller, Get, Post, Put, Body, Param, ParseIntPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { TypeSavingsAccountService } from './type-savings-account.service';
import { CreateTypeSavingsAccountDto } from './dto/create-type-savings-account.dto';
import { UpdateTypeSavingsAccountDto } from './dto/update-type-savings-account.dto';
import { DocumentType } from 'src/modules/documents/document-type/entities/document-type.entity';
import { TypeSavingsAccount } from './entities/type-savings-account.entity';

@ApiTags('Savings Products')
@Controller('savings-products')
export class TypeSavingsAccountController {
  constructor(private readonly service: TypeSavingsAccountService) {}

  @Get()
  @ApiOperation({ summary: 'Liste tous les produits d’épargne' })
  @ApiResponse({ status: 200, type: [TypeSavingsAccount] })
  findAll(): Promise<TypeSavingsAccount[]> {
    return this.service.findAll();
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
  create(@Body() dto: CreateTypeSavingsAccountDto): Promise<TypeSavingsAccount> {
    return this.service.create(dto);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Met à jour un produit d’épargne et ses documents requis' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: UpdateTypeSavingsAccountDto })
  @ApiResponse({ status: 200, type: TypeSavingsAccount })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTypeSavingsAccountDto,
  ): Promise<TypeSavingsAccount> {
    return this.service.update(id, dto);
  }
}
