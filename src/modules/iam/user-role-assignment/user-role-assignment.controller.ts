// src/iam/user-role-assignment/user-role-assignment.controller.ts
import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Patch,
  Delete,
} from '@nestjs/common';
import { UserRoleAssignmentService } from './user-role-assignment.service';
import { AssignRoleDto } from './dto/assign-role.dto';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { UpdateRoleAssignmentDto } from './dto/update-role-assignment.dto';

@ApiTags('IAM - User Role Assignments')
@Controller('iam/user-role-assignments')
export class UserRoleAssignmentController {
  constructor(
    private readonly assignmentService: UserRoleAssignmentService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Assigner un rôle à un utilisateur' })
  async assignRole(@Body() assignRoleDto: AssignRoleDto) {
    return this.assignmentService.assignRole(assignRoleDto);
  }

  @Get(':userId')
  @ApiOperation({ summary: 'Lister les rôles d\'un utilisateur' })
  async getUserRoles(@Param('userId') userId: number) {
    return this.assignmentService.getUserRoles(userId);
  }

  @Patch(':userId/roles/:roleId')
  @ApiOperation({ summary: 'Mettre à jour le statut d\'une assignation' })
  async updateStatus(
    @Param('userId') userId: number,
    @Param('roleId') roleId: number,
    @Body() updateDto: UpdateRoleAssignmentDto,
  ) {
    return this.assignmentService.updateStatus(userId, roleId, updateDto.status);
  }

  @Delete(':userId/roles/:roleId')
  @ApiOperation({ summary: 'Retirer un rôle à un utilisateur' })
  async removeRole(
    @Param('userId') userId: number,
    @Param('roleId') roleId: number,
  ) {
    return this.assignmentService.removeAssignment(userId, roleId);
  }
}