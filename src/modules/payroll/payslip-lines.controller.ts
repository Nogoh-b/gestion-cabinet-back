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
import { PayslipLinesService } from './payslip-lines.service';
import { CreatePayslipLineDto } from './dto/create-payslip-line.dto';
import { UpdatePayslipLineDto } from './dto/update-payslip-line.dto';

@Controller('payslip-lines')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth()
export class PayslipLinesController {
  constructor(private readonly service: PayslipLinesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('edit_payslip')
  @ApiOperation({ summary: 'Ajouter une ligne à une fiche de paie' })
  create(@Body() dto: CreatePayslipLineDto) {
    return this.service.create(dto);
  }

  @Get('/payslip/:payslipId')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('view_payslips')
  @ApiOperation({ summary: 'Lignes d\'une fiche de paie' })
  findByPayslip(@Param('payslipId') payslipId: string) {
    return this.service.findByPayslip(+payslipId);
  }

  @Get(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('view_payslips')
  @ApiOperation({ summary: 'Détail d\'une ligne de paie' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('edit_payslip')
  @ApiOperation({ summary: 'Modifier une ligne de paie' })
  update(@Param('id') id: string, @Body() dto: UpdatePayslipLineDto) {
    return this.service.update(+id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('edit_payslip')
  @ApiOperation({ summary: 'Supprimer une ligne de paie' })
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}
