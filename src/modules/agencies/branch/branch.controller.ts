import { Controller, Get, Post, Body, Param, Delete, Put } from '@nestjs/common';
import { BranchService } from './branch.service';
import { CreateBranchDto } from './dto/create-branch.dto';
import { UpdateBranchDto } from './dto/update-branch.dto';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@Controller('branch')
@ApiTags('branch')
export class BranchController {
  constructor(private readonly branchService: BranchService) {}

  @Post()
  @ApiOperation({ summary: 'Create new branch' })
  @ApiResponse({ status: 201, description: 'Branch successfully created' })
  createBranch(@Body() dto: CreateBranchDto) {
    return this.branchService.createBranch(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all branches' })
  findAllBranches() {
    return this.branchService.findAllBranches();
  }

  @Put(':id')
  @ApiOperation({ summary: 'Update branch' })
  updateBranch(@Param('id') id: string, @Body() dto: UpdateBranchDto) {
    return this.branchService.updateBranch(+id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete branch' })
  deleteBranch(@Param('id') id: string) {
    return this.branchService.deleteBranch(+id);
  }
}
