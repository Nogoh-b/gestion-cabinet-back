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
import { ExpenseLinesService } from './expense-lines.service';
import { CreateExpenseLineDto } from './dto/create-expense-line.dto';
import { UpdateExpenseLineDto } from './dto/update-expense-line.dto';

@Controller('expense-lines')
@ApiBearerAuth()
export class ExpenseLinesController {
  constructor(private readonly service: ExpenseLinesService) {}

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('MANAGE_EXPENSES')
  @ApiOperation({ summary: 'Ajouter une ligne de dépense' })
  create(@Body() dto: CreateExpenseLineDto) {
    return this.service.create(dto);
  }

  @Get('/report/:reportId')
  @RequirePermissions('')
  @ApiOperation({ summary: 'Lignes d\'une note de frais' })
  findByReport(@Param('reportId') reportId: string) {
    return this.service.findByReport(+reportId);
  }

  @Get(':id')
  @RequirePermissions('')
  @ApiOperation({ summary: 'Détail d\'une ligne de dépense' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('MANAGE_EXPENSES')
  @ApiOperation({ summary: 'Modifier une ligne de dépense' })
  update(@Param('id') id: string, @Body() dto: UpdateExpenseLineDto) {
    return this.service.update(+id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('MANAGE_EXPENSES')
  @ApiOperation({ summary: 'Supprimer une ligne de dépense' })
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}