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
import { PayslipsService } from './payslips.service';
import { CreatePayslipDto } from './dto/create-payslip.dto';
import { PayslipSearchDto } from './dto/payslip-search.dto';
import { Payslip } from './entities/payslip.entity';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';

@Controller('payslips')
@ApiBearerAuth()
export class PayslipsController {
  constructor(private readonly service: PayslipsService) {}

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
      Payslip,
      paginationParams,
    );
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
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('edit_payslip')
  @ApiOperation({ summary: 'Modifier une fiche de paie' })
  update(@Param('id') id: string, @Body() dto: CreatePayslipDto) {
    return this.service.update(+id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('edit_payslip')
  @ApiOperation({ summary: 'Supprimer une fiche de paie' })
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}