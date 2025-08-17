import { Module } from '@nestjs/common';
import { TypeCreditModule } from './type_credit/typeCredit.module';
import { LoanModule } from './loan/loan.module';
import { UsersService } from '../iam/user/user.service';
import { User } from '../iam/user/entities/user.entity';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Customer } from '../customer/customer/entities/customer.entity';
import { UserRole } from '../iam/user-role/entities/user-role.entity';
import { UserRolesService } from '../iam/user-role/user-role.service';
import { RolePermissionService } from '../iam/role-permission/role-permission.service';
import { RolePermission } from '../iam/role-permission/entities/role-permission.entity';
import { PermissionsService } from '../iam/permission/permission.service';
import { Permission } from '../iam/permission/entities/permission.entity';

@Module({
  imports: [
    LoanModule,
    TypeCreditModule,
    TypeOrmModule.forFeature([
      User,
      Customer,
      UserRole,
      RolePermission,
      Permission,
    ]),
  ],
  providers: [
    UsersService,
    UserRolesService,
    RolePermissionService,
    PermissionsService,
  ],
})
export class CreditModule {}
