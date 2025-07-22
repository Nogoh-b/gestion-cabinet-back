import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { PaginationQueryDto } from 'src/core/shared/dto/pagination-query.dto';
import { Controller, Post, Body, Param, Put, UseGuards, Get, Query } from '@nestjs/common';






import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';



import { BranchService } from './branch.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';










@Controller('branch')
@ApiTags('branch')
@ApiBearerAuth()
export class BranchController {
  constructor(private readonly branchService: BranchService) {}

  @Post()
  @ApiOperation({ summary: 'Create new branch' })
  @ApiResponse({ status: 201, description: 'Branch successfully created' })
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('CREATE_BRANCH')
  createBranch(@Body() dto: CreateBranchDto) {
    return this.branchService.createBranch(dto);
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
  @RequirePermissions('VIEW_BRANCH')
  findOne(@Param('id') id: number) {
    return this.branchService.findOne(id);
  }

  @Get(':id/employees')
  @ApiOperation({ summary: 'Get All Employees of a Branch' })
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('VIEW_BRANCH')
  findEmployees(@Param('id') id: number,     @Query() query: PaginationQueryDto
  ) {
    const { page, limit, term, fields, exact, from, to } = query;
    const fieldList = fields ? fields.split(',') : undefined;
    const isExact = exact ;
    return this.branchService.findEmployeesByBranchId(id);
  }

  @Get(':id/savings-accounts')
  @ApiOperation({ summary: 'Get All Employees of a Branch' })
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('VIEW_BRANCH')
  findAllSavingAccounts(@Param('id') id: number,     @Query() query: PaginationQueryDto) {
    const { page, limit, term, fields, exact, from, to } = query;
    const fieldList = fields ? fields.split(',') : undefined;
    const isExact = exact ;
    return this.branchService.findAllSavingAccounts(id,false,
      page ? +page : undefined,
      limit ? +limit : undefined,
      term,
      fieldList,
      isExact,
      from ? new Date(from).toISOString() : undefined,
      to ? new Date(to).toISOString() : undefined);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update branch' })
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('EDIT_BRANCH')
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
  @RequirePermissions('VIEW_BRANCH')
  findAllInactivesBranches() {
    return this.branchService.findAllBranches(0);
  }

  @Get('deactivate')
  @ApiOperation({ summary: 'Get Inactive Branch' })
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermissions('VIEW_BRANCH')
  deactivateBranch(@Param('id') id: number) {
    return this.branchService.deactivate(id);
  }

  @Get('activate')
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @ApiOperation({ summary: 'Get Inactive Branch' })
  @RequirePermissions('VIEW_BRANCH')
  activateBranch(@Param('id') id: number) {
    return this.branchService.activate(id);
  }

  @Get(':id/stats')
  @ApiOperation({ summary: 'Get stats Branch' })
  // @RequirePermissions('VIEW_BRANCH_STATS')
  stats(@Param('id') id: number) {
    return this.branchService.stats(id);
  }
}
