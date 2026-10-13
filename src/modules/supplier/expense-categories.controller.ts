import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { CreateExpenseCategoryDto } from './dto/create-expense-category.dto';
import { UpdateExpenseCategoryDto } from './dto/update-expense-category.dto';
import { ExpenseCategoriesService } from './expense-categories.service';

@Controller('expense-categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ExpenseCategoriesController {
  constructor(private readonly service: ExpenseCategoriesService) {}

  @Get()
  @RequirePermissions('view_expenses')
  @ApiOperation({
    summary: 'Lister les catégories de dépenses (recherche incluse)',
  })
  list(@Query('search') search?: string) {
    return this.service.list(search);
  }

  @Post()
  @RequirePermissions('create_expense_report')
  @ApiOperation({ summary: 'Créer une catégorie de dépense' })
  create(@Body() dto: CreateExpenseCategoryDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @RequirePermissions('edit_expense_report')
  @ApiOperation({ summary: 'Modifier une catégorie de dépense' })
  update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateExpenseCategoryDto,
  ) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('edit_expense_report')
  @ApiOperation({ summary: 'Désactiver une catégorie de dépense' })
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.service.remove(id);
  }
}
