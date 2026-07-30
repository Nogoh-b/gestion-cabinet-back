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
import { plainToInstance } from 'class-transformer';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { CurrentUser } from 'src/core/decorators/current-user.decorator';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';
import { CreatePayslipDto } from './dto/create-payslip.dto';
import { PayPayslipDto } from './dto/pay-payslip.dto';
import {
  PayslipListResponseDto,
  PayslipResponseDto,
} from './dto/payslip-response.dto';
import { PayslipSearchDto } from './dto/payslip-search.dto';
import { RevertPayslipDto } from './dto/revert-payslip.dto';
import { UpdatePayslipDto } from './dto/update-payslip.dto';
import { PayslipsService } from './payslips.service';
import { PayrollGenerationService } from './services/payroll-generation.service';
import { PayrollStatsService } from './services/payroll-stats.service';

@Controller('payslips')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PayslipsController {
  constructor(
    private readonly service: PayslipsService,
    private readonly generation: PayrollGenerationService,
    private readonly stats: PayrollStatsService,
  ) {}

  private actor(user: any) {
    return {
      userId: Number(user?.userId ?? user?.id),
      role: user?.role,
    };
  }

  private detail(value: object | object[]) {
    return plainToInstance(PayslipResponseDto, value, {
      excludeExtraneousValues: true,
      enableImplicitConversion: true,
    });
  }

  private list(value: object | object[]) {
    return plainToInstance(PayslipListResponseDto, value, {
      excludeExtraneousValues: true,
      enableImplicitConversion: true,
    });
  }

  @Post()
  @RequirePermissions('generate_payslip')
  @ApiOperation({ summary: 'Préparer un bulletin en brouillon' })
  async create(
    @Body() dto: CreatePayslipDto,
    @CurrentUser() user: any,
  ) {
    return this.detail(await this.service.create(dto, this.actor(user)));
  }

  @Get('/me')
  @RequirePermissions('view_own_payslip')
  @ApiOperation({ summary: 'Consulter uniquement mes bulletins payés' })
  async findOwn(@CurrentUser() user: any) {
    return this.list(await this.service.findOwn(this.actor(user)));
  }

  @Get('/me/:id')
  @RequirePermissions('view_own_payslip')
  @ApiOperation({ summary: 'Consulter un de mes bulletins payés' })
  async findOwnOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.detail(
      await this.service.findOwnOne(id, this.actor(user)),
    );
  }

  @Get('/search')
  @RequirePermissions('view_payslips')
  @ApiOperation({ summary: 'Rechercher les bulletins (administration RH)' })
  async search(
    @Query() searchParams?: PayslipSearchDto,
    @Query() paginationParams?: PaginationParamsDto,
  ) {
    const result = await this.service.searchWithTransformer(
      searchParams as any,
      PayslipListResponseDto,
      paginationParams,
    );
    return { ...result, data: this.list(result.data) };
  }

  @Get('/stats')
  @RequirePermissions('view_payslips')
  @ApiOperation({ summary: 'Vue d’ensemble de la masse salariale' })
  overview(@Query('periodId') periodId?: string) {
    return this.stats.overview(periodId ? +periodId : undefined);
  }

  @Get('/stats/by-period')
  @RequirePermissions('view_payslips')
  @ApiOperation({ summary: 'Masse salariale agrégée par période' })
  statsByPeriod() {
    return this.stats.byPeriod();
  }

  @Get('/period/:periodId')
  @RequirePermissions('view_payslips')
  @ApiOperation({ summary: 'Bulletins d’une période' })
  async findByPeriod(
    @Param('periodId', ParseIntPipe) periodId: number,
  ) {
    return this.list(await this.service.findByPeriod(periodId));
  }

  @Get('/employee/:employeeId')
  @RequirePermissions('view_payslips')
  @ApiOperation({ summary: 'Bulletins d’un collaborateur (administration RH)' })
  async findByEmployee(
    @Param('employeeId', ParseIntPipe) employeeId: number,
  ) {
    return this.list(await this.service.findByEmployee(employeeId));
  }

  @Get()
  @RequirePermissions('view_payslips')
  @ApiOperation({ summary: 'Lister les bulletins (administration RH)' })
  async findAll() {
    return this.list(await this.service.findAll());
  }

  @Get(':id')
  @RequirePermissions('view_payslips')
  @ApiOperation({ summary: 'Détail d’un bulletin (administration RH)' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.detail(await this.service.findOne(id));
  }

  @Patch(':id')
  @RequirePermissions('edit_payslip')
  @ApiOperation({ summary: 'Modifier un bulletin brouillon' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePayslipDto,
  ) {
    return this.detail(await this.service.update(id, dto));
  }

  @Post(':id/validate')
  @RequirePermissions('validate_payslip')
  @ApiOperation({ summary: 'Valider et figer un bulletin' })
  async validate(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.detail(
      await this.service.validate(id, this.actor(user)),
    );
  }

  @Post(':id/pay')
  @RequirePermissions('pay_payslip')
  @ApiOperation({ summary: 'Payer un bulletin validé' })
  async pay(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PayPayslipDto,
    @CurrentUser() user: any,
  ) {
    return this.detail(
      await this.service.pay(id, dto, this.actor(user)),
    );
  }

  @Post(':id/revert')
  @RequirePermissions('validate_payslip')
  @ApiOperation({ summary: 'Rouvrir un bulletin validé avec justification' })
  async revert(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RevertPayslipDto,
    @CurrentUser() user: any,
  ) {
    return this.detail(
      await this.service.revertToDraft(
        id,
        dto.reason,
        this.actor(user),
      ),
    );
  }

  @Post(':id/commissions')
  @RequirePermissions('edit_payslip')
  @ApiOperation({ summary: 'Générer les commissions internes' })
  generateCommissions(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { rate?: number },
  ) {
    return this.generation.generateCommissions(id, body?.rate ?? 10);
  }

  @Delete(':id')
  @RequirePermissions('edit_payslip')
  @ApiOperation({ summary: 'Supprimer un bulletin brouillon' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.service.remove(id, this.actor(user));
  }
}
