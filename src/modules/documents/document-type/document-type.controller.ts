// src/core/document/document-type.controller.ts
import { Controller, Post, Body, Get, Param, Put, Delete, UseGuards } from '@nestjs/common';
import { DocumentTypeService } from './document-type.service';
import { CreateDocumentTypeDto } from './dto/create-document-type.dto';
import { UpdateDocumentTypeDto } from './dto/update-document-type.dto';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';

@ApiTags('Document Types')
@Controller('document-types')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class DocumentTypeController {
  constructor(private readonly service: DocumentTypeService) {}

  @Post()
  @ApiOperation({ summary: 'Créer un type de document' })
  @ApiResponse({ status: 201, description: 'Type de document créé' })
  @RequirePermissions('CREATE_DOCUMENT_TYPE')
  create(@Body() createDto: CreateDocumentTypeDto) {
    return this.service.create(createDto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister tous les types de documents' })
  @RequirePermissions('VIEW_DOCUMENT_TYPE')
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupérer un type de document' })
  @RequirePermissions('VIEW_DOCUMENT_TYPE')
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Mettre à jour un type de document' })
  @RequirePermissions('EDIT_DOCUMENT_TYPE')
  update(@Param('id') id: string, @Body() updateDto: UpdateDocumentTypeDto) {
    return this.service.update(+id, updateDto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Supprimer un type de document' })
  @RequirePermissions('DELETE_DOCUMENT_TYPE')
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}