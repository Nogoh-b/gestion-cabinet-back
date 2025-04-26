import { Module } from '@nestjs/common';
import { UserModule } from './user/user.module';
import { PermissionModule } from './permission/permission.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserRole } from './user-role/entities/user-role.entity';
import { Permission } from './permission/entities/permission.entity';
import { RolePermission } from './role-permission/entities/role-permission.entity';
import { UserRoleAssignment } from './user-role-assignment/entities/user-role-assignment.entity';
import { RolePermissionController } from './role-permission/role-permission.controller';
import { RolePermissionService } from './role-permission/role-permission.service';
import { UserRoleService } from './user-role/user-role.service';
import { UserRoleController } from './user-role/user-role.controller';
import { UserRoleAssignmentController } from './user-role-assignment/user-role-assignment.controller';
import { UserRoleAssignmentService } from './user-role-assignment/user-role-assignment.service';

@Module({
  controllers: [ UserRoleController,RolePermissionController,  UserRoleAssignmentController],
  imports: [
    TypeOrmModule.forFeature([
      UserRole,
      Permission,
      RolePermission,
      UserRoleAssignment,
    ]),
     UserModule, PermissionModule],
     providers:[RolePermissionService, UserRoleService, UserRoleAssignmentService],
})
export class IamModule {}
