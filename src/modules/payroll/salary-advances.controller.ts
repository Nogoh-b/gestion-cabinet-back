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
import { plainToInstance } from 'class-transformer';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { CurrentUser } from 'src/core/decorators/current-user.decorator';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';
import { CancelSalaryAdvanceDto } from './dto/cancel-salary-advance.dto';
import { CreateSalaryAdvanceDto } from './dto/create-salary-advance.dto';
import { PaySalaryAdvanceDto } from './dto/pay-salary-advance.dto';
import { SalaryAdvanceResponseDto } from './dto/salary-advance-response.dto';
import { UpdateSalaryAdvanceDto } from './dto/update-salary-advance.dto';
import { SalaryAdvancesService } from './salary-advances.service';

@Controller('salary-advances')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class SalaryAdvancesController {
  constructor(
    private readonly service: SalaryAdvancesService,
  ) {}

  private actor(user: any) {
    return {
      userId: Number(user?.userId ?? user?.id),
      role: user?.role,
    };
  }

  private response(value: object | object[]) {
    return plainToInstance(SalaryAdvanceResponseDto, value, {
      excludeExtraneousValues: true,
      enableImplicitConversion: true,
    });
  }

  @Post()
  @RequirePermissions('edit_payslip')
  @ApiOperation({ summary: 'Créer une demande d’avance' })
  async create(
    @Body() dto: CreateSalaryAdvanceDto,
    @CurrentUser() user: any,
  ) {
    return this.response(
      await this.service.create(dto, this.actor(user)),
    );
  }

  @Get('/search')
  @RequirePermissions('view_payslips')
  @ApiOperation({ summary: 'Rechercher les avances' })
  async search(
    @Query() searchParams?: any,
    @Query() paginationParams?: PaginationParamsDto,
  ) {
    const result = await this.service.searchWithTransformer(
      searchParams as any,
      SalaryAdvanceResponseDto,
      paginationParams,
    );
    return { ...result, data: this.response(result.data) };
  }

  @Get('/me')
  @RequirePermissions('view_own_payslip')
  @ApiOperation({ summary: 'Consulter uniquement mes avances sur salaire' })
  async findOwn(@CurrentUser() user: any) {
    return this.response(
      await this.service.findOwn(this.actor(user)),
    );
  }

  @Get('/me/:id')
  @RequirePermissions('view_own_payslip')
  @ApiOperation({ summary: 'Consulter une de mes avances sur salaire' })
  async findOwnOne(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.response(
      await this.service.findOwnOne(id, this.actor(user)),
    );
  }

  @Get('/employee/:employeeId')
  @RequirePermissions('view_payslips')
  @ApiOperation({ summary: 'Avances d’un collaborateur' })
  async findByEmployee(
    @Param('employeeId', ParseIntPipe) employeeId: number,
  ) {
    return this.response(
      await this.service.findByEmployee(employeeId),
    );
  }

  @Get()
  @RequirePermissions('view_payslips')
  @ApiOperation({ summary: 'Lister les avances' })
  async findAll() {
    return this.response(await this.service.findAll());
  }

  @Get(':id')
  @RequirePermissions('view_payslips')
  @ApiOperation({ summary: 'Détail d’une avance' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.response(await this.service.findOne(id));
  }

  @Patch(':id')
  @RequirePermissions('edit_payslip')
  @ApiOperation({ summary: 'Modifier une demande non approuvée' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateSalaryAdvanceDto,
  ) {
    return this.response(await this.service.update(id, dto));
  }

  @Post(':id/approve')
  @RequirePermissions('validate_payslip')
  @ApiOperation({ summary: 'Approuver une avance demandée' })
  async approve(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.response(
      await this.service.approve(id, this.actor(user)),
    );
  }

  @Post(':id/pay')
  @RequirePermissions('pay_payslip')
  @ApiOperation({ summary: 'Verser une avance approuvée' })
  async pay(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: PaySalaryAdvanceDto,
    @CurrentUser() user: any,
  ) {
    return this.response(
      await this.service.pay(id, dto, this.actor(user)),
    );
  }

  @Post(':id/cancel')
  @RequirePermissions('edit_payslip')
  @ApiOperation({ summary: 'Annuler une avance non versée' })
  async cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CancelSalaryAdvanceDto,
    @CurrentUser() user: any,
  ) {
    return this.response(
      await this.service.cancel(id, dto.reason, this.actor(user)),
    );
  }

  @Delete(':id')
  @RequirePermissions('edit_payslip')
  @ApiOperation({ summary: 'Supprimer une demande non approuvée' })
  remove(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: any,
  ) {
    return this.service.remove(id, this.actor(user));
  }
}
