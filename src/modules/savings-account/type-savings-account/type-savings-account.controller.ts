import { AddDocumentTypesToTypeDto, CreateTypeSavingsAccountDto } from './dto/create-type-savings-account.dto';
import { UpdateTypeSavingsAccountDto } from './dto/update-type-savings-account.dto';
import { Controller, Get, Post, Patch, Delete, Param, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { TypeSavingsAccountResponseDto } from './dto/response-type-savings-account.dto';

@ApiTags('Type Savings Accounts')
@Controller('type-savings-account')
export class TypeSavingsAccountController {
  @Get()
  @ApiOperation({ summary: 'Liste tous les types de compte épargne' })
  @ApiResponse({ status: 200, type: [TypeSavingsAccountResponseDto] })
  findAll(): TypeSavingsAccountResponseDto[] {
    return [];
  }

  @Get(':id')
  @ApiOperation({ summary: 'Détail d\'un type de compte' })
  @ApiResponse({ status: 200, type: TypeSavingsAccountResponseDto })
  findOne(@Param('id') id: number): TypeSavingsAccountResponseDto {
    return new TypeSavingsAccountResponseDto;
  }

  @Post()
  @ApiOperation({ summary: 'Crée un type de compte épargne' })
  @ApiResponse({ status: 201, type: TypeSavingsAccountResponseDto })
  create(@Body() dto: CreateTypeSavingsAccountDto): TypeSavingsAccountResponseDto {
    return new TypeSavingsAccountResponseDto;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Met à jour un type de compte' })
  @ApiResponse({ status: 200, type: TypeSavingsAccountResponseDto })
  update(@Param('id') id: number, @Body() dto: UpdateTypeSavingsAccountDto): TypeSavingsAccountResponseDto {
    return new TypeSavingsAccountResponseDto;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprime un type de compte' })
  @ApiResponse({ status: 204 })
  remove(@Param('id') id: number): void {}

  @Get(':id/document-types')
  @ApiOperation({ summary: 'Récupère les types de documents requis pour ce type de compte' })
  findDocumentTypes(@Param('id') id: number): any[] { return []; }

  @Post(':id/document-types')
  @ApiOperation({ summary: 'Associe des types de documents à un type de compte' })
  @ApiResponse({ status: 200 })
  addDocumentTypes(@Param('id') id: number, @Body() dto: AddDocumentTypesToTypeDto): void {}

  @Delete(':id/document-types/:documentTypeId')
  @ApiOperation({ summary: 'Retire un type de document d’un type de compte' })
  @ApiResponse({ status: 204 })
  removeDocumentType(@Param('id') id: number, @Param('documentTypeId') docId: number): void {}
}
