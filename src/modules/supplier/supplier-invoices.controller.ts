import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { SupplierInvoicesService } from './supplier-invoices.service';
import { CreateSupplierInvoiceDto } from './dto/create-supplier-invoice.dto';
import { UpdateSupplierInvoiceDto } from './dto/update-supplier-invoice.dto';
import { SupplierInvoiceSearchDto } from './dto/supplier-invoice-search.dto';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';
import { SupplierInvoice } from './entities/supplier-invoice.entity';

@Controller('supplier-invoices')
@ApiBearerAuth()
export class SupplierInvoicesController {
  constructor(private readonly service: SupplierInvoicesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('create_supplier_invoice')
  @ApiOperation({ summary: 'Enregistrer une facture fournisseur' })
  create(@Body() dto: CreateSupplierInvoiceDto) {
    return this.service.create(dto);
  }

  @Get('/search')
  @RequirePermissions('view_supplier_invoices')
  @ApiOperation({ summary: 'Rechercher les factures fournisseurs' })
  @ApiResponse({
    status: 200,
    description: 'Liste des factures',
    type: [SupplierInvoice],
  })
  async search(
    @Query() searchParams?: SupplierInvoiceSearchDto,
    @Query() paginationParams?: PaginationParamsDto,
  ) {
    return this.service.searchWithTransformer(
      searchParams as any,
      SupplierInvoice,
      paginationParams,
    );
  }

  @Get('/supplier/:supplierId')
  @RequirePermissions('view_supplier_invoices')
  @ApiOperation({ summary: 'Factures d\'un fournisseur' })
  findBySupplier(@Param('supplierId') supplierId: string) {
    return this.service.findBySupplier(+supplierId);
  }

  @Get()
  @RequirePermissions('view_supplier_invoices')
  @ApiOperation({ summary: 'Lister toutes les factures fournisseurs' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @RequirePermissions('view_supplier_invoices')
  @ApiOperation({ summary: 'Détail d\'une facture fournisseur' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('edit_supplier_invoice')
  @ApiOperation({ summary: 'Modifier une facture fournisseur' })
  update(@Param('id') id: string, @Body() dto: UpdateSupplierInvoiceDto) {
    return this.service.update(+id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('delete_supplier_invoice')
  @ApiOperation({ summary: 'Supprimer une facture fournisseur' })
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}