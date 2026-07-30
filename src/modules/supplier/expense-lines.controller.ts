import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  ParseIntPipe,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { ExpenseLinesService } from './expense-lines.service';
import { CreateExpenseLineDto } from './dto/create-expense-line.dto';
import { UpdateExpenseLineDto } from './dto/update-expense-line.dto';
import { plainToInstance } from 'class-transformer';
import { ExpenseLineResponseDto } from './dto/expense-report-response.dto';
import { CurrentUser } from 'src/core/decorators/current-user.decorator';
import {
  ResourceAccessMode,
  ResourcePolicyService,
} from 'src/core/resource-policy.service';

@Controller('expense-lines')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ExpenseLinesController {
  constructor(
    private readonly service: ExpenseLinesService,
    private readonly resourcePolicy: ResourcePolicyService,
  ) {}

  private response(
    value: object | object[],
  ): ExpenseLineResponseDto | ExpenseLineResponseDto[] {
    return plainToInstance(ExpenseLineResponseDto, value, {
      excludeExtraneousValues: true,
      enableImplicitConversion: true,
    });
  }

  @Post()
  @RequirePermissions('edit_expense_report')
  @ApiOperation({ summary: 'Ajouter une ligne de dépense' })
  async create(@Body() dto: CreateExpenseLineDto) {
    return this.response(await this.service.create(dto));
  }

  @Get('/report/:reportId')
  @RequirePermissions('view_expense_reports')
  @ApiOperation({ summary: 'Lignes d\'une note de frais' })
  async findByReport(@Param('reportId', ParseIntPipe) reportId: number) {
    return this.response(await this.service.findByReport(reportId));
  }

  @Get(':id')
  @RequirePermissions('view_expense_reports')
  @ApiOperation({ summary: 'Détail d\'une ligne de dépense' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.response(await this.service.findOne(id));
  }

  @Post(':id/attachment')
  @RequirePermissions('edit_expense_report')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  async attachEvidence(
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
    @CurrentUser() user: any,
  ) {
    await this.assertLinkedDossierAccess(id, user, 'write');
    return this.response(
      await this.service.attachEvidence(id, file, {
        userId: Number(user?.userId ?? user?.id),
      }),
    );
  }

  @Get(':id/attachment')
  @RequirePermissions('view_expense_reports')
  async downloadEvidence(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
    @Res() response: Response,
  ) {
    await this.assertLinkedDossierAccess(id, user, 'read');
    const evidence = await this.service.getEvidence(id, {
      userId: Number(user?.userId ?? user?.id),
    });
    response.setHeader('Content-Type', evidence.mimeType);
    response.setHeader('Content-Length', String(evidence.buffer.length));
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('X-Content-SHA256', evidence.sha256);
    response.setHeader(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(evidence.filename)}`,
    );
    response.send(evidence.buffer);
  }

  private async assertLinkedDossierAccess(
    expenseLineId: number,
    user: any,
    mode: ResourceAccessMode,
  ): Promise<void> {
    const line = await this.service.findOne(expenseLineId);
    if (!line.dossier_id) return;
    await this.resourcePolicy.assertDossierAccess(
      line.dossier_id,
      {
        ...user,
        id: Number(user?.userId ?? user?.id),
        userId: Number(user?.userId ?? user?.id),
        tenantId: Number(user?.tenantId),
      },
      mode,
      mode === 'write'
        ? 'edit_expense_report'
        : 'view_expense_reports',
    );
  }

  @Patch(':id')
  @RequirePermissions('edit_expense_report')
  @ApiOperation({ summary: 'Modifier une ligne de dépense' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateExpenseLineDto,
  ) {
    return this.response(await this.service.update(id, dto));
  }

  @Delete(':id')
  @RequirePermissions('edit_expense_report')
  @ApiOperation({ summary: 'Supprimer une ligne de dépense' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
