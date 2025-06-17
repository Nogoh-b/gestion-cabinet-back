import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';





import { Customer } from '../customer/customer/entities/customer.entity';
import { ActivitiesUserController } from './activities-user/activities-user.controller';
import { ActivitiesUserService } from './activities-user/activities-user.service';
import { ActivitiesUser } from './activities-user/entities/activities-user.entity';
import { Permission } from './permission/entities/permission.entity';
import { PermissionsController } from './permission/permission.controller';
import { PermissionsService } from './permission/permission.service';
import { RolePermission } from './role-permission/entities/role-permission.entity';
import { RolePermissionController } from './role-permission/role-permission.controller';
import { RolePermissionService } from './role-permission/role-permission.service';
import { UserRoleAssignment } from './user-role-assignment/entities/user-role-assignment.entity';
import { UserRoleAssignmentController } from './user-role-assignment/user-role-assignment.controller';
import { UserRoleAssignmentService } from './user-role-assignment/user-role-assignment.service';
import { UserRole } from './user-role/entities/user-role.entity';
import { UserRolesController } from './user-role/user-role.controller';
import { UserRolesService } from './user-role/user-role.service';
import { User } from './user/entities/user.entity';
import { UsersController } from './user/user.controller';
import { UsersService } from './user/user.service';






@Module({
  controllers: [ UsersController, ActivitiesUserController, PermissionsController, UserRolesController, RolePermissionController,  UserRoleAssignmentController],
  imports: [
    TypeOrmModule.forFeature([
      UserRole,
      Permission,
      RolePermission,
      UserRoleAssignment,
      User,
      ActivitiesUser,
      Customer
    ]),
  ],
     providers:[
     PermissionsService,
     UserRolesService, 
     RolePermissionService, 
    UsersService, 
     ActivitiesUserService, 
     UserRoleAssignmentService, 
     ],
     exports:[
      PermissionsService,
      UsersService,
      UserRoleAssignmentService,
      RolePermissionService,
      UserRolesService,
      ActivitiesUserService,
      TypeOrmModule
     ]
})
export class IamModule {}
