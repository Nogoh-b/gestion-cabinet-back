import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { CurrentUser } from 'src/core/decorators/current-user.decorator';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';
import { CreatePayrollPeriodDto } from './dto/create-payroll-period.dto';
import { PayrollPeriodSearchDto } from './dto/payroll-period-search.dto';
import { UpdatePayrollPeriodDto } from './dto/update-payroll-period.dto';
import { PayrollPeriod } from './entities/payroll-period.entity';
import { PayrollPeriodsService } from './payroll-periods.service';
import { PayrollGenerationService } from './services/payroll-generation.service';

@Controller('payroll-periods')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PayrollPeriodsController {
  constructor(
    private readonly service: PayrollPeriodsService,
    private readonly generation: PayrollGenerationService,
  ) {}

  private actor(user: any) {
    return {
      userId: Number(user?.userId ?? user?.id),
      role: user?.role,
    };
  }

  @Post()
  @RequirePermissions('create_payroll_period')
  @ApiOperation({ summary: 'Créer une période de paie en brouillon' })
  create(@Body() dto: CreatePayrollPeriodDto) {
    return this.service.create(dto);
  }

  @Get('/search')
  @RequirePermissions('view_payroll_periods')
  @ApiOperation({ summary: 'Rechercher les périodes de paie' })
  search(
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
  @RequirePermissions('view_payroll_periods')
  @ApiOperation({ summary: 'Lister les périodes de paie' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @RequirePermissions('view_payroll_periods')
  @ApiOperation({ summary: 'Détail d’une période de paie' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('edit_payroll_period')
  @ApiOperation({ summary: 'Modifier une période brouillon' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePayrollPeriodDto,
  ) {
    return this.service.update(id, dto);
  }

  @Post(':id/generate')
  @RequirePermissions('generate_payslip')
  @ApiOperation({ summary: 'Préparer les bulletins de la période' })
  generate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Query('branchId') branchId?: string,
  ) {
    return this.generation.generateForPeriod(
      id,
      Number(user?.userId ?? user?.id),
      branchId ? +branchId : undefined,
    );
  }

  @Post(':id/close')
  @RequirePermissions('close_payroll_period')
  @ApiOperation({
    summary:
      'Clôturer une période dont tous les bulletins sont validés',
  })
  close(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.service.close(id, this.actor(user));
  }

  @Post(':id/mark-paid')
  @RequirePermissions('pay_payslip')
  @ApiOperation({
    summary:
      'Marquer la période payée après paiement de tous les bulletins',
  })
  markPaid(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.service.markPaid(id, this.actor(user));
  }

  @Delete(':id')
  @RequirePermissions('edit_payroll_period')
  @ApiOperation({ summary: 'Supprimer une période brouillon vide' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.service.remove(id, this.actor(user));
  }
}
