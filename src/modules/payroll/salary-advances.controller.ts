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
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';
import { SalaryAdvancesService } from './salary-advances.service';
import { CreateSalaryAdvanceDto } from './dto/create-salary-advance.dto';
import { UpdateSalaryAdvanceDto } from './dto/update-salary-advance.dto';
import { SalaryAdvanceResponseDto } from './dto/salary-advance-response.dto';

@Controller('salary-advances')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SalaryAdvancesController {
  constructor(private readonly service: SalaryAdvancesService) {}

  @Post()
  @RequirePermissions('generate_payslip')
  @ApiOperation({ summary: 'Créer une avance sur salaire' })
  create(@Body() dto: CreateSalaryAdvanceDto) {
    return this.service.create(dto);
  }

  @Get('/search')
  @RequirePermissions('view_payslips')
  @ApiOperation({ summary: 'Rechercher les avances sur salaire' })
  search(@Query() searchParams?: any, @Query() paginationParams?: PaginationParamsDto) {
    return this.service.searchWithTransformer(
      searchParams as any,
      SalaryAdvanceResponseDto,
      paginationParams,
    );
  }

  @Get('/employee/:employeeId')
  @RequirePermissions('view_payslips')
  @ApiOperation({ summary: "Avances sur salaire d'un collaborateur" })
  findByEmployee(@Param('employeeId') employeeId: string) {
    return this.service.findByEmployee(+employeeId);
  }

  @Get()
  @RequirePermissions('view_payslips')
  @ApiOperation({ summary: 'Lister toutes les avances sur salaire' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @RequirePermissions('view_payslips')
  @ApiOperation({ summary: "Détail d'une avance sur salaire" })
  async findOne(@Param('id') id: string) {
    const advance = await this.service.findOne(+id);
    return plainToInstance(SalaryAdvanceResponseDto, advance, { excludeExtraneousValues: true });
  }

  @Patch(':id')
  @RequirePermissions('edit_payslip')
  @ApiOperation({ summary: 'Modifier une avance (non versée)' })
  update(@Param('id') id: string, @Body() dto: UpdateSalaryAdvanceDto) {
    return this.service.update(+id, dto);
  }

  // ── Cycle de vie ───────────────────────────────────────────────────────────

  @Post(':id/approve')
  @RequirePermissions('edit_payslip')
  @ApiOperation({ summary: 'Approuver une avance demandée' })
  approve(@Param('id') id: string) {
    return this.service.approve(+id);
  }

  @Post(':id/pay')
  @RequirePermissions('edit_payslip')
  @ApiOperation({ summary: "Verser l'avance (écriture comptable 425/512)" })
  pay(@Param('id') id: string) {
    return this.service.pay(+id);
  }

  @Post(':id/cancel')
  @RequirePermissions('edit_payslip')
  @ApiOperation({ summary: 'Annuler une avance non versée' })
  cancel(@Param('id') id: string) {
    return this.service.cancel(+id);
  }

  @Delete(':id')
  @RequirePermissions('edit_payslip')
  @ApiOperation({ summary: 'Supprimer une avance (sauf versée)' })
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}
