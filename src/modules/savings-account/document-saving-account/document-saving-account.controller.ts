import { Controller, Get, Post, Body, Patch, Param, Delete } from '@nestjs/common';
import { CreateDocumentSavingAccountDto } from './dto/create-document-saving-account.dto';
import { UpdateDocumentSavingAccountDto } from './dto/update-document-saving-account.dto';

import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { DocumentSavingAccountResponseDto } from './dto/response-document-saving-account.dto copy';

@ApiTags('Document Saving Accounts')
@Controller('document-saving-account')
export class DocumentSavingAccountController {
  @Get()
  @ApiOperation({ summary: 'Récupère tous les documents de compte épargne' })
  @ApiResponse({ status: 200, type: [DocumentSavingAccountResponseDto] })
  findAll(): DocumentSavingAccountResponseDto[] {
    // return service.findAll();
    return [];
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupère un document par ID' })
  @ApiResponse({ status: 200, type: DocumentSavingAccountResponseDto })
  findOne(@Param('id') id: number): DocumentSavingAccountResponseDto {
    // return service.findOne(id);
    return new DocumentSavingAccountResponseDto();
 ;
  }

  @Post()
  @ApiOperation({ summary: 'Crée un nouveau document de compte épargne' })
  @ApiResponse({ status: 201, type: DocumentSavingAccountResponseDto })
  create(@Body() dto: CreateDocumentSavingAccountDto): DocumentSavingAccountResponseDto {
    // return service.create(dto);
    return new DocumentSavingAccountResponseDto();
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Met à jour partiellement un document' })
  @ApiResponse({ status: 200, type: DocumentSavingAccountResponseDto })
  update(@Param('id') id: number, @Body() dto: UpdateDocumentSavingAccountDto): DocumentSavingAccountResponseDto {
    // return service.update(id, dto);
    return new DocumentSavingAccountResponseDto();
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprime un document' })
  @ApiResponse({ status: 204 })
  remove(@Param('id') id: number): void {
    // return service.remove(id);
  }
}
