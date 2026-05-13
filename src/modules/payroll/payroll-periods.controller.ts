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
import { PayrollPeriodsService } from './payroll-periods.service';
import { CreatePayrollPeriodDto } from './dto/create-payroll-period.dto';
import { PayrollPeriodSearchDto } from './dto/payroll-period-search.dto';
import { PayrollPeriod } from './entities/payroll-period.entity';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';

@Controller('payroll-periods')
@ApiBearerAuth()
export class PayrollPeriodsController {
  constructor(private readonly service: PayrollPeriodsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('MANAGE_PAYROLL')
  @ApiOperation({ summary: 'Créer une période de paie' })
  create(@Body() dto: CreatePayrollPeriodDto) {
    return this.service.create(dto);
  }

  @Get('/search')
  @ApiOperation({ summary: 'Rechercher les périodes de paie' })
  @ApiResponse({ status: 200, description: 'Liste des périodes', type: [PayrollPeriod] })
  async search(
    @Query() searchParams?: PayrollPeriodSearchDto,
    @Query() paginationParams?: PaginationParamsDto,
  ) {
    return this.service.searchWithTransformer(
      searchParams as any,
      PayrollPeriod,
      paginationParams,
    );
  }

  @Get()
  @RequirePermissions('')
  @ApiOperation({ summary: 'Lister toutes les périodes de paie' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @RequirePermissions('')
  @ApiOperation({ summary: 'Détail d\'une période de paie' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('MANAGE_PAYROLL')
  @ApiOperation({ summary: 'Modifier une période de paie' })
  update(@Param('id') id: string, @Body() dto: CreatePayrollPeriodDto) {
    return this.service.update(+id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('MANAGE_PAYROLL')
  @ApiOperation({ summary: 'Supprimer une période de paie' })
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}