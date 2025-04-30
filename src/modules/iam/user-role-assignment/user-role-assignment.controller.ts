// user-role-assignment.controller.ts
import { Controller, Post, Body, Delete, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { UserRoleAssignmentService } from './user-role-assignment.service';
import { CreateUserRoleAssignmentDto } from './dto/create-user-role-assignment.dto';
import { UserRoleAssignment } from './entities/user-role-assignment.entity';

@ApiTags('Gestion des Assignations Utilisateur-Rôle')
@Controller('user-role-assignments')
export class UserRoleAssignmentController {
  constructor(private readonly service: UserRoleAssignmentService) {}

  @Post()
  @ApiOperation({ summary: 'Assigner un rôle à un utilisateur' })
  @ApiResponse({ status: 201, description: 'Rôle assigné', type: UserRoleAssignment })
  create(@Body() dto: CreateUserRoleAssignmentDto) {
    return this.service.create(dto);
  }

  @Delete(':userId/:roleId')
  @ApiOperation({ summary: 'Retirer un rôle à un utilisateur' })
  remove(
    @Param('userId') userId: number,
    @Param('roleId') roleId: number,
  ) {
    return this.service.remove(userId, roleId);
  }

  @Get('user/:userId')
  @ApiOperation({ summary: 'Lister les rôles d\'un utilisateur' })
  findByUser(@Param('userId') userId: number) {
    return this.service.findByUser(userId);
  }
}