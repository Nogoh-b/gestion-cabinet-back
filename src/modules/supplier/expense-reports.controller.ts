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
import { ExpenseReportsService } from './expense-reports.service';
import { CreateExpenseReportDto } from './dto/create-expense-report.dto';
import { UpdateExpenseReportDto } from './dto/update-expense-report.dto';
import { ExpenseReport } from './entities/expense-report.entity';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';
import { ExpenseReportSearchDto } from './dto/expense-report-search.dto';

@Controller('expense-reports')
@ApiBearerAuth()
export class ExpenseReportsController {
  constructor(private readonly service: ExpenseReportsService) {}

  @Post()
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('MANAGE_EXPENSES')
  @ApiOperation({ summary: 'Créer une note de frais' })
  create(@Body() dto: CreateExpenseReportDto) {
    return this.service.create(dto);
  }

  @Get('/search')
  @ApiOperation({ summary: 'Rechercher les notes de frais' })
  @ApiResponse({
    status: 200,
    description: 'Liste des notes de frais',
    type: [ExpenseReport],
  })
  async search(
    @Query() searchParams?: ExpenseReportSearchDto,
    @Query() paginationParams?: PaginationParamsDto,
  ) {
    return this.service.searchWithTransformer(
      searchParams as any,
      ExpenseReport,
      paginationParams,
    );
  }

  @Get('/employee/:employeeId')
  @RequirePermissions('')
  @ApiOperation({ summary: 'Notes de frais d\'un employé' })
  findByEmployee(@Param('employeeId') employeeId: string) {
    return this.service.findByEmployee(+employeeId);
  }

  @Get()
  @RequirePermissions('')
  @ApiOperation({ summary: 'Lister toutes les notes de frais' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @RequirePermissions('')
  @ApiOperation({ summary: 'Détail d\'une note de frais' })
  findOne(@Param('id') id: string) {
    return this.service.findOne(+id);
  }

  @Patch(':id/approve')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('MANAGE_EXPENSES')
  @ApiOperation({ summary: 'Approuver une note de frais' })
  approve(@Param('id') id: string, @Body('userId') userId: number) {
    return this.service.approve(+id, userId);
  }

  @Patch(':id/reject')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('MANAGE_EXPENSES')
  @ApiOperation({ summary: 'Rejeter une note de frais' })
  reject(
    @Param('id') id: string,
    @Body('userId') userId: number,
    @Body('notes') notes: string,
  ) {
    return this.service.reject(+id, userId, notes);
  }

  @Patch(':id/reimburse')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('MANAGE_EXPENSES')
  @ApiOperation({ summary: 'Marquer comme remboursée' })
  markReimbursed(@Param('id') id: string) {
    return this.service.markReimbursed(+id);
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('MANAGE_EXPENSES')
  @ApiOperation({ summary: 'Modifier une note de frais' })
  update(@Param('id') id: string, @Body() dto: UpdateExpenseReportDto) {
    return this.service.update(+id, dto);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('MANAGE_EXPENSES')
  @ApiOperation({ summary: 'Supprimer une note de frais' })
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}