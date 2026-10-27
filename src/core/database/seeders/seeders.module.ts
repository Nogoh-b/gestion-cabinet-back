// src/database/seeders/seeders.module.ts

import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Permission } from 'src/modules/iam/permission/entities/permission.entity';
import { RolePermission } from 'src/modules/iam/role-permission/entities/role-permission.entity';
import { UserRoleAssignment } from 'src/modules/iam/user-role-assignment/entities/user-role-assignment.entity';
import { UserRole } from 'src/modules/iam/user-role/entities/user-role.entity';
import { User } from 'src/modules/iam/user/entities/user.entity';
import { AgenciesModule } from 'src/modules/agencies/agencies.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      UserRole,
      Permission,
      UserRoleAssignment,
      RolePermission,
    ]),
    AgenciesModule,
  ],
  // L'ancien SuperAdminSeeder (identifiants codés en dur) est supprimé :
  // le premier compte plateforme se crée via `npm run platform:create-owner`.
  providers: [],
  exports: [],
})
export class SeedersModule {}
