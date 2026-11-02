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
  ParseIntPipe,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
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
import { CurrentUser } from 'src/core/decorators/current-user.decorator';
import { PaySupplierInvoiceDto } from './dto/pay-supplier-invoice.dto';
import { plainToInstance } from 'class-transformer';
import { SupplierInvoiceResponseDto } from './dto/supplier-invoice-response.dto';

@Controller('supplier-invoices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SupplierInvoicesController {
  constructor(private readonly service: SupplierInvoicesService) {}

  private response(
    value: object | object[],
  ): SupplierInvoiceResponseDto | SupplierInvoiceResponseDto[] {
    return plainToInstance(SupplierInvoiceResponseDto, value, {
      excludeExtraneousValues: true,
      enableImplicitConversion: true,
    });
  }

  @Post()
  @RequirePermissions('create_supplier_invoice')
  @ApiOperation({ summary: 'Enregistrer une facture fournisseur' })
  async create(@Body() dto: CreateSupplierInvoiceDto, @CurrentUser() user: any) {
    return this.response(await this.service.create(dto, {
      userId: Number(user?.userId ?? user?.id),
    }));
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
    const result = await this.service.searchWithTransformer(
      searchParams as any,
      SupplierInvoiceResponseDto,
      paginationParams,
    );
    return {
      ...result,
      data: this.response(result.data),
    };
  }

  @Get('/supplier/:supplierId')
  @RequirePermissions('view_supplier_invoices')
  @ApiOperation({ summary: 'Factures d\'un fournisseur' })
  async findBySupplier(
    @Param('supplierId', ParseIntPipe) supplierId: number,
  ) {
    return this.response(await this.service.findBySupplier(supplierId));
  }

  @Get()
  @RequirePermissions('view_supplier_invoices')
  @ApiOperation({ summary: 'Lister toutes les factures fournisseurs' })
  async findAll() {
    return this.response(await this.service.findAll());
  }

  @Get(':id')
  @RequirePermissions('view_supplier_invoices')
  @ApiOperation({ summary: 'Détail d\'une facture fournisseur' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.response(await this.service.findOne(id));
  }

  @Post(':id/attachment')
  @RequirePermissions('edit_supplier_invoice')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async attachEvidence(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    return this.response(
      await this.service.attachEvidence(id, file, {
        userId: Number(user?.userId ?? user?.id),
      }),
    );
  }

  @Get(':id/attachment')
  @RequirePermissions('view_supplier_invoices')
  async downloadEvidence(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Res() response: Response,
  ) {
    const evidence = await this.service.getEvidence(id, {
      userId: Number(user?.userId ?? user?.id),
    });
    response.setHeader('Content-Type', evidence.mimeType);
    response.setHeader('Content-Length', String(evidence.buffer.length));
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-SHA256', evidence.sha256);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(evidence.filename)}`,
    );
    response.send(evidence.buffer);
  }

  @Post(':id/approve')
  @RequirePermissions('validate_supplier_invoice')
  @ApiOperation({ summary: 'Approuver une facture fournisseur' })
  async approve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.response(await this.service.approve(id, {
      userId: Number(user?.userId ?? user?.id),
    }));
  }

  @Post(':id/pay')
  @RequirePermissions('pay_supplier_invoice')
  @ApiOperation({ summary: 'Marquer une facture fournisseur comme payée' })
  async pay(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PaySupplierInvoiceDto,
    @CurrentUser() user: any,
  ) {
    return this.response(await this.service.markAsPaid(id, dto, {
      userId: Number(user?.userId ?? user?.id),
    }));
  }

  @Patch(':id')
  @RequirePermissions('edit_supplier_invoice')
  @ApiOperation({ summary: 'Modifier une facture fournisseur' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSupplierInvoiceDto,
  ) {
    return this.response(await this.service.update(id, dto));
  }

  @Delete(':id')
  @RequirePermissions('delete_supplier_invoice')
  @ApiOperation({ summary: 'Supprimer une facture fournisseur' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove();
  }
}
