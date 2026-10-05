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
  ForbiddenException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { plainToInstance } from 'class-transformer';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { CurrentUser } from 'src/core/decorators/current-user.decorator';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';
import { EmployeeLeavesService } from './employee-leaves.service';
import { CreateEmployeeLeaveDto } from './dto/create-employee-leave.dto';
import { UpdateEmployeeLeaveDto } from './dto/update-employee-leave.dto';
import { EmployeeLeaveResponseDto } from './dto/employee-leave-response.dto';
import {
  ApproveRequestDto,
  CancelRequestDto,
  RejectRequestDto,
} from './dto/decide-request.dto';

/**
 * Permissions (congés) des collaborateurs.
 *
 * Deux portes d'entrée :
 *  - self-service (`/request`, `/mine`) : le collaborateur agit sur ses
 *    propres demandes, avec la permission `request_leave` ;
 *  - administration (le reste) : lecture et décisions sur toutes les demandes,
 *    avec `view_employee_requests` / `manage_employee_requests`.
 *
 * L'identifiant d'un Employee est celui de son User (relation OneToOne sur la
 * même clé) : `user.id` est donc directement l'`employee_id`.
 */
@Controller('employee-leaves')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class EmployeeLeavesController {
  constructor(private readonly service: EmployeeLeavesService) {}

  // ── Self-service ───────────────────────────────────────────────────────────

  @Post('request')
  @RequirePermissions('request_leave')
  @ApiOperation({ summary: 'Demander une permission pour soi-même' })
  request(@Body() dto: CreateEmployeeLeaveDto, @CurrentUser() user: any) {
    return this.service.create(dto, Number(user.id));
  }

  @Get('mine')
  @RequirePermissions('request_leave')
  @ApiOperation({ summary: 'Mes demandes de permission' })
  async findMine(@CurrentUser() user: any) {
    const leaves = await this.service.findByEmployee(Number(user.id));
    return plainToInstance(EmployeeLeaveResponseDto, leaves, {
      excludeExtraneousValues: true,
    });
  }

  @Post('mine/:id/cancel')
  @RequirePermissions('request_leave')
  @ApiOperation({ summary: 'Annuler ma propre demande de permission' })
  async cancelMine(
    @Param('id') id: string,
    @Body() dto: CancelRequestDto,
    @CurrentUser() user: any,
  ) {
    // Garde-fou : on ne laisse annuler que ses propres demandes.
    const leave = await this.service.findOne(+id);
    if (leave.employee_id !== Number(user.id)) {
      throw new ForbiddenException('Cette demande ne vous appartient pas.');
    }
    return this.service.cancel(+id, dto.reason, Number(user.id));
  }

  // ── Administration ─────────────────────────────────────────────────────────

  @Post()
  @RequirePermissions('manage_employee_requests')
  @ApiOperation({ summary: 'Créer une permission pour un collaborateur' })
  create(@Body() dto: CreateEmployeeLeaveDto) {
    return this.service.create(dto);
  }

  @Get('/search')
  @RequirePermissions('view_employee_requests')
  @ApiOperation({ summary: 'Rechercher les permissions' })
  search(
    @Query() searchParams?: any,
    @Query() paginationParams?: PaginationParamsDto,
  ) {
    return this.service.searchWithTransformer(
      searchParams,
      EmployeeLeaveResponseDto,
      paginationParams,
    );
  }

  @Get('/employee/:employeeId')
  @RequirePermissions('view_employee_requests')
  @ApiOperation({ summary: "Permissions d'un collaborateur" })
  async findByEmployee(@Param('employeeId') employeeId: string) {
    const leaves = await this.service.findByEmployee(+employeeId);
    return plainToInstance(EmployeeLeaveResponseDto, leaves, {
      excludeExtraneousValues: true,
    });
  }

  @Get()
  @RequirePermissions('view_employee_requests')
  @ApiOperation({ summary: 'Lister toutes les permissions' })
  findAll() {
    return this.service.findAll();
  }

  @Get(':id')
  @RequirePermissions('view_employee_requests')
  @ApiOperation({ summary: "Détail d'une permission" })
  async findOne(@Param('id') id: string) {
    const leave = await this.service.findOne(+id);
    return plainToInstance(EmployeeLeaveResponseDto, leave, {
      excludeExtraneousValues: true,
    });
  }

  @Patch(':id')
  @RequirePermissions('manage_employee_requests')
  @ApiOperation({ summary: 'Modifier les dates/motif avant validation' })
  update(@Param('id') id: string, @Body() dto: UpdateEmployeeLeaveDto) {
    return this.service.update(+id, dto);
  }

  @Post(':id/approve')
  @RequirePermissions('manage_employee_requests')
  @ApiOperation({ summary: 'Valider une permission' })
  approve(
    @Param('id') id: string,
    @Body() dto: ApproveRequestDto,
    @CurrentUser() user: any,
  ) {
    return this.service.approve(+id, Number(user.id), dto?.reason);
  }

  @Post(':id/reject')
  @RequirePermissions('manage_employee_requests')
  @ApiOperation({ summary: 'Refuser une permission (raison obligatoire)' })
  reject(
    @Param('id') id: string,
    @Body() dto: RejectRequestDto,
    @CurrentUser() user: any,
  ) {
    return this.service.reject(+id, dto.reason, Number(user.id));
  }

  @Post(':id/cancel')
  @RequirePermissions('manage_employee_requests')
  @ApiOperation({ summary: 'Annuler une permission (raison obligatoire)' })
  cancel(
    @Param('id') id: string,
    @Body() dto: CancelRequestDto,
    @CurrentUser() user: any,
  ) {
    return this.service.cancel(+id, dto.reason, Number(user.id));
  }

  @Delete(':id')
  @RequirePermissions('manage_employee_requests')
  @ApiOperation({ summary: 'Supprimer une permission (sauf validée)' })
  remove(@Param('id') id: string) {
    return this.service.remove(+id);
  }
}
