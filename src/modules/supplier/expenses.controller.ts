import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { CurrentUser } from 'src/core/decorators/current-user.decorator';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { User } from '../iam/user/entities/user.entity';
import {
  CreateUnifiedExpenseDto,
  ExpenseWorkspaceSearchDto,
} from './dto/expense-workspace.dto';
import { ExpenseWorkspaceService } from './expense-workspace.service';

@Controller('expenses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ExpensesController {
  constructor(private readonly service: ExpenseWorkspaceService) {}

  @Get('search')
  @RequirePermissions('view_expenses')
  @ApiOperation({ summary: 'Rechercher toutes les dépenses du cabinet' })
  search(@Query() filters: ExpenseWorkspaceSearchDto) {
    return this.service.search(filters);
  }

  @Get('summary')
  @RequirePermissions('view_expenses')
  @ApiOperation({ summary: 'Synthèse des dépenses' })
  summary(@Query() filters: ExpenseWorkspaceSearchDto) {
    return this.service.summary(filters);
  }

  @Get('dossier/:dossierId')
  @RequirePermissions('view_expenses')
  @ApiOperation({ summary: 'Dépenses associées à un dossier' })
  byDossier(@Param('dossierId') dossierId: string) {
    return this.service.findByDossier(Number(dossierId));
  }

  @Post()
  @RequirePermissions('view_expenses')
  @ApiOperation({ summary: 'Créer une dépense fournisseur ou collaborateur' })
  create(
    @Body() dto: CreateUnifiedExpenseDto,
    @CurrentUser() user: User,
  ) {
    return this.service.create(dto, user as any);
  }
}
