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
  ParseIntPipe,
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
import { CurrentUser } from 'src/core/decorators/current-user.decorator';
import { RejectExpenseReportDto } from './dto/reject-expense-report.dto';
import { ReimburseExpenseReportDto } from './dto/reimburse-expense-report.dto';
import { plainToInstance } from 'class-transformer';
import { ExpenseReportResponseDto } from './dto/expense-report-response.dto';

@Controller('expense-reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ExpenseReportsController {
  constructor(private readonly service: ExpenseReportsService) {}

  private response(
    value: object | object[],
  ): ExpenseReportResponseDto | ExpenseReportResponseDto[] {
    return plainToInstance(ExpenseReportResponseDto, value, {
      excludeExtraneousValues: true,
      enableImplicitConversion: true,
    });
  }

  @Post()
  @RequirePermissions('create_expense_report')
  @ApiOperation({ summary: 'Créer une note de frais' })
  async create(@Body() dto: CreateExpenseReportDto) {
    return this.response(await this.service.create(dto));
  }

  @Get('/search')
  @RequirePermissions('view_expense_reports')
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
    const result = await this.service.searchWithTransformer(
      searchParams as any,
      ExpenseReportResponseDto,
      paginationParams,
    );
    return {
      ...result,
      data: this.response(result.data),
    };
  }

  @Get('/employee/:employeeId')
  @RequirePermissions('view_expense_reports')
  @ApiOperation({ summary: 'Notes de frais d\'un employé' })
  async findByEmployee(
    @Param('employeeId', ParseIntPipe) employeeId: number,
  ) {
    return this.response(await this.service.findByEmployee(employeeId));
  }

  @Get()
  @RequirePermissions('view_expense_reports')
  @ApiOperation({ summary: 'Lister toutes les notes de frais' })
  async findAll() {
    return this.response(await this.service.findAll());
  }

  @Get(':id')
  @RequirePermissions('view_expense_reports')
  @ApiOperation({ summary: 'Détail d\'une note de frais' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.response(await this.service.findOne(id));
  }

  @Post(':id/submit')
  @RequirePermissions('edit_expense_report')
  @ApiOperation({ summary: 'Soumettre une note de frais' })
  async submit(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.response(await this.service.submit(id, {
      userId: Number(user?.userId ?? user?.id),
      role: user?.role,
    }));
  }

  @Post(':id/approve')
  @RequirePermissions('validate_expense_report')
  @ApiOperation({ summary: 'Approuver une note de frais' })
  async approve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.response(await this.service.approve(id, {
      userId: Number(user?.userId ?? user?.id),
      role: user?.role,
    }));
  }

  @Post(':id/reject')
  @RequirePermissions('validate_expense_report')
  @ApiOperation({ summary: 'Rejeter une note de frais' })
  async reject(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectExpenseReportDto,
    @CurrentUser() user: any,
  ) {
    return this.response(await this.service.reject(id, dto.raison, {
      userId: Number(user?.userId ?? user?.id),
      role: user?.role,
    }));
  }

  @Post(':id/reimburse')
  @RequirePermissions('reimburse_expense_report')
  @ApiOperation({ summary: 'Marquer comme remboursée' })
  async markReimbursed(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReimburseExpenseReportDto,
    @CurrentUser() user: any,
  ) {
    return this.response(await this.service.markReimbursed(id, dto, {
      userId: Number(user?.userId ?? user?.id),
      role: user?.role,
    }));
  }

  @Patch(':id')
  @RequirePermissions('edit_expense_report')
  @ApiOperation({ summary: 'Modifier une note de frais' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateExpenseReportDto,
  ) {
    return this.response(await this.service.update(id, dto));
  }

  @Delete(':id')
  @RequirePermissions('delete_expense_report')
  @ApiOperation({ summary: 'Supprimer une note de frais' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove();
  }
}
