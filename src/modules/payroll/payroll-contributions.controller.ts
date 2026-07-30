import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { CurrentUser } from 'src/core/decorators/current-user.decorator';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { CreatePayrollContributionDto } from './dto/create-payroll-contribution.dto';
import { RetirePayrollContributionDto } from './dto/retire-payroll-contribution.dto';
import { UpdatePayrollContributionDto } from './dto/update-payroll-contribution.dto';
import { PayrollContributionsService } from './payroll-contributions.service';

@Controller('payroll-contributions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PayrollContributionsController {
  constructor(
    private readonly service: PayrollContributionsService,
  ) {}

  private actor(user: any) {
    return {
      userId: Number(user?.userId ?? user?.id),
      role: user?.role,
    };
  }

  @Post()
  @RequirePermissions('manage_payroll_rates')
  @ApiOperation({ summary: 'Créer une nouvelle version brouillon' })
  create(
    @Body() dto: CreatePayrollContributionDto,
    @CurrentUser() user: any,
  ) {
    return this.service.create(dto, this.actor(user));
  }

  @Post('/seed-defaults')
  @RequirePermissions('manage_payroll_rates')
  @ApiOperation({
    summary:
      'Installer des brouillons indicatifs à valider professionnellement',
  })
  seedDefaults(@CurrentUser() user: any) {
    return this.service.seedDefaults(this.actor(user));
  }

  @Get()
  @RequirePermissions('view_payroll')
  @ApiOperation({ summary: 'Lister toutes les versions du barème' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @RequirePermissions('view_payroll')
  @ApiOperation({ summary: 'Détail d’une version de cotisation' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.service.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('manage_payroll_rates')
  @ApiOperation({ summary: 'Modifier une version brouillon' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePayrollContributionDto,
  ) {
    return this.service.update(id, dto);
  }

  @Post(':id/publish')
  @RequirePermissions('manage_payroll_rates')
  @ApiOperation({ summary: 'Publier et figer une version du barème' })
  publish(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.service.publish(id, this.actor(user));
  }

  @Post(':id/retire')
  @RequirePermissions('manage_payroll_rates')
  @ApiOperation({ summary: 'Retirer une version publiée avec motif' })
  retire(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RetirePayrollContributionDto,
    @CurrentUser() user: any,
  ) {
    return this.service.retire(id, dto, this.actor(user));
  }

  @Delete(':id')
  @RequirePermissions('manage_payroll_rates')
  @ApiOperation({ summary: 'Supprimer uniquement un brouillon inutilisé' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.service.remove(id, this.actor(user));
  }
}
