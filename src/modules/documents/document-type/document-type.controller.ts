// src/core/document/document-type.controller.ts
import { Controller, Post, Body, Get, Param, Put, Delete } from '@nestjs/common';
import { DocumentTypeService } from './document-type.service';
import { CreateDocumentTypeDto } from './dto/create-document-type.dto';
import { UpdateDocumentTypeDto } from './dto/update-document-type.dto';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';

@ApiTags('Document Types')
@Controller('document-types')
export class DocumentTypeController {
  constructor(private readonly service: DocumentTypeService) {}

  @Post()
  @ApiOperation({ summary: 'Créer un type de document' })
  @ApiResponse({ status: 201, description: 'Type de document créé' })
  create(@Body() createDto: CreateDocumentTypeDto) {
    return this.service.create(createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister tous les types de documents' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupérer un type de document' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Mettre à jour un type de document' })
  update(@Param('id') id: string, @Body() updateDto: UpdateDocumentTypeDto) {
    return this.service.update(+id, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un type de document' })
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}