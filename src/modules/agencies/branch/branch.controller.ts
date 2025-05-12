import { Controller, Post, Body, Param, Delete, Put, UseGuards, Get } from '@nestjs/common';
import { BranchService } from './branch.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';

@Controller('branch')
@ApiTags('branch')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth() 

export class BranchController {
  constructor(private readonly branchService: BranchService) {}

  @Post()
  @ApiOperation({ summary: 'Create new branch' })
  @ApiResponse({ status: 201, description: 'Branch successfully created' })
  @RequirePermissions('CREATE_BRANCH')
  createBranch(@Body() dto: CreateBranchDto) {
    return this.branchService.createBranch(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  @ApiOperation({ summary: 'Get all branches' })
  @RequirePermissions('VIEW_BRANCH')
  findAllBranches() {
    return this.branchService.findAllBranches();
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update branch' })
  @RequirePermissions('EDIT_BRANCH')
  updateBranch(@Param('id') id: string, @Body() dto: UpdateBranchDto) {
    return this.branchService.updateBranch(+id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete branch' })
  @RequirePermissions('DELETE_BRANCH')
  deleteBranch(@Param('id') id: string) {
    return this.branchService.deleteBranch(+id);
  }
}
