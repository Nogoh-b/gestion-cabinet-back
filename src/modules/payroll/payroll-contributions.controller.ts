import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { PayrollContributionsService } from './payroll-contributions.service';
import { CreatePayrollContributionDto } from './dto/create-payroll-contribution.dto';
import { UpdatePayrollContributionDto } from './dto/update-payroll-contribution.dto';

@Controller('payroll-contributions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PayrollContributionsController {
  constructor(private readonly service: PayrollContributionsService) {}

  @Post()
  @RequirePermissions('edit_payroll_period')
  @ApiOperation({ summary: 'Créer une cotisation du barème' })
  create(@Body() dto: CreatePayrollContributionDto) {
    return this.service.create(dto);
  }

  @Post('/seed-defaults')
  @RequirePermissions('edit_payroll_period')
  @ApiOperation({ summary: 'Installer le barème par défaut (CEMAC) pour le cabinet' })
  seedDefaults() {
    return this.service.seedDefaults();
  }

  @Get()
  @RequirePermissions('view_payroll')
  @ApiOperation({ summary: 'Lister le barème de cotisations' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @RequirePermissions('view_payroll')
  @ApiOperation({ summary: 'Détail d\'une cotisation' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Patch(':id')
  @RequirePermissions('edit_payroll_period')
  @ApiOperation({ summary: 'Modifier une cotisation' })
  update(@Param('id') id: string, @Body() dto: UpdatePayrollContributionDto) {
    return this.service.update(+id, dto);
  }

  @Delete(':id')
  @RequirePermissions('edit_payroll_period')
  @ApiOperation({ summary: 'Supprimer une cotisation' })
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}
