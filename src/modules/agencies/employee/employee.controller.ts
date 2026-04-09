import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';
import { SearchCriteria } from 'src/core/shared/services/search/base-v1.service';
import { CreateUserDto } from 'src/modules/iam/user/dto/create-user.dto';



import { Controller, Get, Post, Body, UseGuards, Param, ParseIntPipe, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse } from '@nestjs/swagger';


import { ResetPasswordRequestDto } from './dto/create-employee.dto';
import { SearchEmployeeDto } from './dto/search-dossier.dto';
import { EmployeeResponseDto } from './dto/response-employee.dto';
import { EmployeeService } from './employee.service';
import { EmployeeStatsService } from './employee-stats.service';






@Controller('user')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth() 

export class EmployeeController {
  constructor(private readonly employeeService: EmployeeService,
  private readonly statsService: EmployeeStatsService) {}


  @Get('stats')
  // @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Obtenir les statistiques des employés' })
  async getStats(
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('branchId') branchId?: number,
  ): Promise<any> {
    return this.statsService.getStats({
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      branchId: branchId ? +branchId : undefined,
      fieldToUseForDate : 'hireDate'
    });
  }

  @Get('stats/:id')
  // @Roles(UserRole.ADMIN, UserRole.AVOCAT)
  @ApiOperation({ summary: 'Obtenir les statistiques d\'un employé spécifique' })
  @ApiParam({ name: 'id', description: 'ID de l\'employé' })
  async getStatsForEmployee(
    @Param('id', ParseIntPipe) id: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<any> {
    return this.statsService.getStats({
      employeeId: id,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

  @Get('stats/workload')
  // @Roles(UserRole.ADMIN)
  async getWorkloadStats() {
    const stats = await this.statsService.getStats({});
    return (stats as any).workloadStats;
  }

  @Get('stats/available')
  // @Roles(UserRole.ADMIN, UserRole.AVOCAT)
  async getAvailableEmployees() {
    const stats = await this.statsService.getStats({});
    return (stats as any).availableEmployees;
  }

  @Get('stats/top-performers')
  // @Roles(UserRole.ADMIN)
  async getTopPerformers() {
    const stats = await this.statsService.getStats({});
    return (stats as any).topPerformers;
  }

  @Get('search')
  @ApiOperation({ summary: 'Recherche texte avec relations' })
  @ApiResponse({ status: 200, description: 'Résultats de recherche', type: [EmployeeResponseDto]  })
  async search(

    @Query() searchParams?: SearchEmployeeDto,
    @Query() paginationParams?: PaginationParamsDto,
  ) {
    return this.employeeService.searchWithTransformer(searchParams as SearchCriteria, EmployeeResponseDto , paginationParams);
  }



  @Post()
  @ApiOperation({ summary: 'Create new employee' })
  @RequirePermissions('CREATE_EMPLOYEE')
  createEmployee(@Body() dto: CreateUserDto) {
    return this.employeeService.createEmployee(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all employees' })
  @RequirePermissions('VIEW_EMPLOYEE')
  findAllEmployees() {
    return this.employeeService.findAllEmployees();
  }
  @Post('send-new-password')
  async sendNewPassword(@Body() dto: ResetPasswordRequestDto) {
    return this.employeeService.send_new_password({
      id: dto.id
    });
  }

  @Get(':id')
  @ApiOperation({ summary: 'Récupérer un employé par son ID' })
  @ApiResponse({ 
    status: 200, 
    description: 'Employé trouvé', 
    type: EmployeeResponseDto 
  })
  @ApiResponse({ status: 404, description: 'Employé non trouvé' })
  @RequirePermissions('VIEW_EMPLOYEE')
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<EmployeeResponseDto | any> {
    return this.employeeService.findOneV1(id,null,EmployeeResponseDto);
  }

  /**
   * Variante: réinitialisation par id directement dans l'URL.
   */
  @Post(':id/send-new-password')
  async sendNewPasswordById(@Param('id', ParseIntPipe) id: number) {
    return this.employeeService.send_new_password({ id }); 
  }
    /*@Get(':id')
    @ApiOperation({ summary: 'Récupérer un utilisateur avec son role' })
    @RequirePermissions('VIEW_EMPLOYEE')
    findOne(@Param('id') id: string): Promise<any> {
      return this.employeeService.findOne(+id);
    }
  
    @Post(':id/desable')
    @ApiOperation({ summary: 'Supression d\'un utilisateur' })
    @RequirePermissions('EDIT_EMPLOYEE')
    remove(@Param('id') id: string): Promise<any> {
      return this.employeeService.descativeUser(+id);
    }
  
    @Post(':id/enable')
    @ApiOperation({ summary: 'Supression d\'un utilisateur' })
    @RequirePermissions('DELETE_EMPLOYEE')
    add(@Param('id') id: string): Promise<any> {
      return this.employeeService.descativeUser(+id);
    }*/
}
