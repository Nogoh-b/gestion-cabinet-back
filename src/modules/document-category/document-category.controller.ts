import { Controller, Get, Post, Body, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { DocumentCategoryService } from './document-category.service';
import { CreateDocumentCategoryDto } from './dto/create-document-category.dto';
import { UpdateDocumentCategoryDto } from './dto/update-document-category.dto';
import { DocumentCategoryResponseDto } from './dto/document-category-response.dto';

@ApiTags('Document Categories')
@ApiBearerAuth()
@Controller('document-categories')
export class DocumentCategoryController {
  constructor(private readonly service: DocumentCategoryService) {}

  @Post()
  @ApiOperation({ summary: 'Créer une nouvelle catégorie de document' })
  @ApiResponse({ status: 201, type: DocumentCategoryResponseDto })
  @RequirePermissions('MANAGE_DOCUMENT_CATEGORIES')
  async create(@Body() dto: CreateDocumentCategoryDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Lister toutes les catégories de documents' })
  @ApiResponse({ status: 200, type: [DocumentCategoryResponseDto] })
  async findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupérer une catégorie par ID' })
  @ApiResponse({ status: 200, type: DocumentCategoryResponseDto })
  async findOne(@Param('id') id: number) {
    return this.service.findOne(id);
  }

  @Post(':id')
  @ApiOperation({ summary: 'Mettre à jour une catégorie' })
  @ApiResponse({ status: 200, type: DocumentCategoryResponseDto })
  @RequirePermissions('MANAGE_DOCUMENT_CATEGORIES')
  async update(
    @Param('id') id: number,
    @Body() dto: UpdateDocumentCategoryDto
  ) {
    return this.service.update(id, dto);
  }
}