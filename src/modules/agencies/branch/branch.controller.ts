import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { PaginationParamsDto } from 'src/core/shared/dto/pagination-params.dto';
import { PaginationQueryDto } from 'src/core/shared/dto/pagination-query.dto';
import { SearchCriteria } from 'src/core/shared/services/search/base-v1.service';
import { Controller, Post, Body, Param, Put, UseGuards, Get, Query, ParseIntPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiResponse, ApiTags } from '@nestjs/swagger';
import { BranchService } from './branch.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { BranchResponseDto } from './dto/response-branch.dto';
import { SearchBranchDto } from './dto/search-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { BranchStatsService } from './branch-stats.service';

@Controller('branch')
@ApiTags('branch')
@ApiBearerAuth()
export class BranchController {
  constructor(private readonly branchService: BranchService, 
    private readonly statsService: BranchStatsService) {}

  @Get('stats')
  // @Roles(UserRole.ADMIN)
  async getStats() {
    return this.statsService.getStats();
  }


  @Get('stats/:id')
  // @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Obtenir les statistiques d\'une agence spécifique' })
  @ApiParam({ name: 'id', description: 'ID de l\'agence' })
  async getStatsForBranch(
    @Param('id', ParseIntPipe) id: number,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ): Promise<any> {
    return this.statsService.getStats({
      branchId: id,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    });
  }

  @Post()
  @ApiOperation({ summary: 'Create new branch' })
  @ApiResponse({ status: 201, description: 'Branch successfully created' })
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  // @RequirePermissions('CREATE_BRANCH')
  createBranch(@Body() dto: CreateBranchDto) {
    return this.branchService.createBranch(dto);
  }

  @Get('search')
  @ApiOperation({ summary: 'Recherche texte avec relations' })
  @ApiResponse({ status: 200, description: 'Résultats de recherche', type: [BranchResponseDto]  })
  async search(

    @Query() searchParams?: SearchBranchDto,
    @Query() paginationParams?: PaginationParamsDto,
  ) {
    // return this.branchService.testSearch()
    return this.branchService.searchWithTransformer(searchParams as SearchCriteria, BranchResponseDto, paginationParams);
  } 
  
  @UseGuards(JwtAuthGuard)
  @Get()
  @ApiOperation({ summary: 'Get all branches' })
  // @UseGuards(JwtAuthGuard, PermissionsGuard)
  // @RequirePermissions('VIEW_BRANCH')
  findAllBranches() {
    return this.branchService.findAllBranches(); 
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get Inactive Branch' })
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  // @RequirePermissions('VIEW_BRANCH')
  findOne(@Param('id') id: number) {
    return this.branchService.findOne(id,true);
  }

  @Get(':id/employees')
  @ApiOperation({ summary: 'Get All Employees of a Branch' })
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  // @RequirePermissions('VIEW_BRANCH')
  findEmployees(@Param('id') id: number,     @Query() query: PaginationQueryDto
  ) {
    const { page, limit, term, fields, exact, from, to } = query;
    const fieldList = fields ? fields.split(',') : undefined;
    const isExact = exact ;
    return this.branchService.findEmployeesByBranchId(id);
  }



  @Put(':id')
  @ApiOperation({ summary: 'Update branch' })
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  // @RequirePermissions('EDIT_BRANCH')
  updateBranch(@Param('id') id: string, @Body() dto: UpdateBranchDto) {
    return this.branchService.updateBranch(+id, dto);
  }

  /*@Delete(':id')
  @ApiOperation({ summary: 'Delete branch' })
  @RequirePermissions('DELETE_BRANCH')
  deleteBranch(@Param('id') id: string) {
    return this.branchService.deleteBranch(+id);
  }*/

  @Get('inactives')
  @ApiOperation({ summary: 'Get Inactive Branch' })
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  // @RequirePermissions('VIEW_BRANCH')
  findAllInactivesBranches() {
    return this.branchService.findAllBranches(0);
  }

  @Get('deactivate')
  @ApiOperation({ summary: 'Get Inactive Branch' })
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  // @RequirePermissions('VIEW_BRANCH')
  deactivateBranch(@Param('id') id: number) {
    return this.branchService.deactivate(id);
  }

  @Get('activate')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiOperation({ summary: 'Get Inactive Branch' })
  // @RequirePermissions('VIEW_BRANCH')
  activateBranch(@Param('id') id: number) {
    return this.branchService.activate(id);
  }


}
