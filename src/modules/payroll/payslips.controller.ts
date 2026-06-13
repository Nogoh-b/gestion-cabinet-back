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
import { plainToInstance } from 'class-transformer';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { PayslipsService } from './payslips.service';
import { PayrollGenerationService } from './services/payroll-generation.service';
import { PayrollStatsService } from './services/payroll-stats.service';
import { CreatePayslipDto } from './dto/create-payslip.dto';
import { UpdatePayslipDto } from './dto/update-payslip.dto';
import { PayslipSearchDto } from './dto/payslip-search.dto';
import { Payslip } from './entities/payslip.entity';
import { PayslipListResponseDto, PayslipResponseDto } from './dto/payslip-response.dto';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';

@Controller('payslips')
@ApiBearerAuth()
export class PayslipsController {
  constructor(
    private readonly service: PayslipsService,
    private readonly generation: PayrollGenerationService,
    private readonly stats: PayrollStatsService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('generate_payslip')
  @ApiOperation({ summary: 'Créer une fiche de paie' })
  create(@Body() dto: CreatePayslipDto) {
    return this.service.create(dto);
  }

  @Get('/search')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('view_payslips')
  @ApiOperation({ summary: 'Rechercher les fiches de paie' })
  @ApiResponse({ status: 200, description: 'Liste des fiches de paie', type: [Payslip] })
  async search(
    @Query() searchParams?: PayslipSearchDto,
    @Query() paginationParams?: PaginationParamsDto,
  ) {
    return this.service.searchWithTransformer(
      searchParams as any,
      PayslipListResponseDto,
      paginationParams,
    );
  }

  @Get('/stats')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('view_payslips')
  @ApiOperation({ summary: 'Masse salariale : vue d\'ensemble (option: ?periodId=)' })
  overview(@Query('periodId') periodId?: string) {
    return this.stats.overview(periodId ? +periodId : undefined);
  }

  @Get('/stats/by-period')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('view_payslips')
  @ApiOperation({ summary: 'Masse salariale agrégée par période' })
  statsByPeriod() {
    return this.stats.byPeriod();
  }

  @Get('/period/:periodId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('view_payslips')
  @ApiOperation({ summary: 'Fiches de paie d\'une période' })
  findByPeriod(@Param('periodId') periodId: string) {
    return this.service.findByPeriod(+periodId);
  }

  @Get('/employee/:employeeId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('view_payslips')
  @ApiOperation({ summary: 'Fiches de paie d\'un employé' })
  findByEmployee(@Param('employeeId') employeeId: string) {
    return this.service.findByEmployee(+employeeId);
  }

  @Get()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('view_payslips')
  @ApiOperation({ summary: 'Lister toutes les fiches de paie' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('view_payslips')
  @ApiOperation({ summary: 'Détail d\'une fiche de paie' })
  async findOne(@Param('id') id: string) {
    const payslip = await this.service.findOne(+id);
    return plainToInstance(PayslipResponseDto, payslip, { excludeExtraneousValues: true });
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('edit_payslip')
  @ApiOperation({ summary: 'Modifier une fiche de paie (brouillon uniquement)' })
  update(@Param('id') id: string, @Body() dto: UpdatePayslipDto) {
    return this.service.update(+id, dto);
  }

  // ── Cycle de vie ───────────────────────────────────────────────────────────

  @Post(':id/validate')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('edit_payslip')
  @ApiOperation({ summary: 'Valider une fiche (fige les montants)' })
  validate(@Param('id') id: string) {
    return this.service.validate(+id);
  }

  @Post(':id/pay')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('edit_payslip')
  @ApiOperation({ summary: 'Marquer une fiche validée comme payée' })
  pay(@Param('id') id: string) {
    return this.service.pay(+id);
  }

  @Post(':id/revert')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('edit_payslip')
  @ApiOperation({ summary: 'Repasser une fiche validée en brouillon' })
  revert(@Param('id') id: string) {
    return this.service.revertToDraft(+id);
  }

  @Post(':id/commissions')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('edit_payslip')
  @ApiOperation({ summary: 'Générer les commissions internes depuis les dossiers' })
  generateCommissions(
    @Param('id') id: string,
    @Body() body: { rate?: number },
  ) {
    return this.generation.generateCommissions(+id, body?.rate ?? 10);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('edit_payslip')
  @ApiOperation({ summary: 'Supprimer une fiche de paie (sauf payée)' })
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}
