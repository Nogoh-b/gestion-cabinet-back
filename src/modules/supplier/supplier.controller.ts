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
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { SupplierSearchDto } from './dto/supplier-search.dto';
import { Supplier } from './entities/supplier.entity';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';
import { SuppliersService } from './supplier.service';

@Controller('suppliers')
@ApiBearerAuth()
export class SuppliersController {
  constructor(private readonly service: SuppliersService) {}

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('MANAGE_EXPENSES')
  @ApiOperation({ summary: 'Créer un fournisseur' })
  create(@Body() dto: CreateSupplierDto) {
    return this.service.create(dto);
  }

  @Get('/search')
  @ApiOperation({ summary: 'Rechercher les fournisseurs' })
  @ApiResponse({ status: 200, description: 'Liste des fournisseurs', type: [Supplier] })
  async search(
    @Query() searchParams?: SupplierSearchDto,
    @Query() paginationParams?: PaginationParamsDto,
  ) {
    return this.service.searchWithTransformer(
      searchParams as any,
      Supplier,
      paginationParams,
    );
  }

  @Get()
  @RequirePermissions('')
  @ApiOperation({ summary: 'Lister tous les fournisseurs actifs' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @RequirePermissions('')
  @ApiOperation({ summary: 'Détail d\'un fournisseur' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('MANAGE_EXPENSES')
  @ApiOperation({ summary: 'Modifier un fournisseur' })
  update(@Param('id') id: string, @Body() dto: UpdateSupplierDto) {
    return this.service.update(+id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('MANAGE_EXPENSES')
  @ApiOperation({ summary: 'Supprimer un fournisseur' })
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}