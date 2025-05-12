// user-roles.controller.ts
import { Controller, Post, Body, Get, Param, Delete, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { CreateUserRoleDto } from './dto/create-user-role.dto';
import { UserRole } from './entities/user-role.entity';
import { UserRolesService } from './user-role.service';
import { RoleResponseDto } from './dto/role-response.dto';
import { JwtAuthGuard } from 'src/core/auth/guards/jwt-auth.guard';
import { PermissionsGuard } from 'src/core/common/guards/permissions.guard';
import { RequirePermissions } from 'src/core/decorators/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiTags('User Roles')
@Controller('user-roles')
@ApiBearerAuth() 

export class UserRolesController {
  constructor(private readonly service: UserRolesService) {}

  @Post()
  @ApiOperation({ summary: 'Create new user role' })
  @ApiResponse({ status: 201, description: 'Role created', type: UserRole })
  @RequirePermissions('MANAGE_ROLE')
    create(@Body() dto: CreateUserRoleDto) {
    return this.service.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all roles with permissions' })
  @RequirePermissions('')
  async findAll(): Promise<RoleResponseDto[]> {
    return this.service.findAllWithPermissions();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get role by ID with permissions' })
  @RequirePermissions('')
  async findOne(@Param('id') id: number): Promise<any> {
    return this.service.findOneWithPermissions(id);
  }




  @Delete(':id')
  @ApiOperation({ summary: 'Delete role' })
  @RequirePermissions('MANAGE_ROLE')
  remove(@Param('id') id: number): Promise<void> {
    return this.service.remove(id);
  }
}