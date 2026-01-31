import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';
import { SearchCriteria } from 'src/core/shared/services/search/base-v1.service';

import { Controller, Get, Post, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';

import { CreateInvoiceTypeDto } from './dto/create-invoice-type.dto';
import { InvoiceTypeResponseDto } from './dto/invoice-type-response.dto';
import { UpdateInvoiceTypeDto } from './dto/update-invoice-type.dto';
import { InvoiceTypeService } from './invoice-type.service';



@ApiTags('Invoice Types')
@ApiBearerAuth()
@Controller('invoice-types')
export class InvoiceTypeController {
  constructor(private readonly service: InvoiceTypeService) {}

  @Post()
  @ApiOperation({ summary: 'Créer un nouveau type de facture' })
  @ApiResponse({ status: 201, type: InvoiceTypeResponseDto })
  @RequirePermissions('MANAGE_INVOICE_TYPES')
  async create(@Body() dto: CreateInvoiceTypeDto) {
    return this.service.create(dto);
  }
  @Get('search')
  @ApiOperation({ summary: 'Recherche texte avec relations' })
  @ApiResponse({ status: 200, description: 'Résultats de recherche', type: [InvoiceTypeResponseDto]  })
  async search(

    @Query() searchParams?: InvoiceTypeResponseDto,
    @Query() paginationParams?: PaginationParamsDto,
  ) {
    return this.service.searchWithTransformer(searchParams as SearchCriteria, InvoiceTypeResponseDto , paginationParams);
  }

  @Get()
  @ApiOperation({ summary: 'Lister tous les types de factures' })
  @ApiResponse({ status: 200, type: [InvoiceTypeResponseDto] })
  async findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupérer un type de facture par ID' })
  @ApiResponse({ status: 200, type: InvoiceTypeResponseDto })
  async findOne(@Param('id') id: number) {
    return this.service.findOne(id);
  }

  @Post(':id')
  @ApiOperation({ summary: 'Mettre à jour un type de facture' })
  @ApiResponse({ status: 200, type: InvoiceTypeResponseDto })
  @RequirePermissions('MANAGE_INVOICE_TYPES')
  async update(
    @Param('id') id: number,
    @Body() dto: UpdateInvoiceTypeDto
  ) {
    return this.service.update(id, dto);
  }
}