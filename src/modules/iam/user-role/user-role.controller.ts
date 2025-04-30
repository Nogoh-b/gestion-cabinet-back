// user-roles.controller.ts
import { Controller, Post, Body, Get, Param, Delete } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { CreateUserRoleDto } from './dto/create-user-role.dto';
import { UserRole } from './entities/user-role.entity';
import { UserRolesService } from './user-role.service';
import { RoleResponseDto } from './dto/role-response.dto';

@ApiTags('User Roles')
@Controller('user-roles')
export class UserRolesController {
  constructor(private readonly service: UserRolesService) {}

  @Post()
  @ApiOperation({ summary: 'Create new user role' })
  @ApiResponse({ status: 201, description: 'Role created', type: UserRole })
  create(@Body() dto: CreateUserRoleDto): Promise<UserRole> {
    return this.service.create(dto);
  }

@Get()
@ApiOperation({ summary: 'Get all roles with permissions' })
async findAll(): Promise<RoleResponseDto[]> {
  return this.service.findAllWithPermissions();
}

@Get(':id')
@ApiOperation({ summary: 'Get role by ID with permissions' })
async findOne(@Param('id') id: number): Promise<any> {
  return this.service.findOneWithPermissions(id);
}

  @Delete(':id')
  @ApiOperation({ summary: 'Delete role' })
  remove(@Param('id') id: number): Promise<void> {
    return this.service.remove(id);
  }
}