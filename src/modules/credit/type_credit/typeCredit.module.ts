import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoreModule } from 'src/core/core.module';
import { TypeCredit } from './entities/typeCredit.entity';
import { TypeCreditService } from './typeCredit.service';
import { TypeCreditController } from './typeCredit.controller';
import { TypeGuarantyController } from '../guaranty/type_guaranty/type_guaranty.controller';
import { TypeGuarantyService } from '../guaranty/type_guaranty/type_guaranty.service';
import { TypeGuaranty } from '../guaranty/type_guaranty/entity/type_guaranty.entity';
import { UsersService } from '../../iam/user/user.service';
import { UserRolesService } from '../../iam/user-role/user-role.service';
import { RolePermissionService } from '../../iam/role-permission/role-permission.service';
import { PermissionsService } from '../../iam/permission/permission.service';
import { User } from '../../iam/user/entities/user.entity';
import { Customer } from '../../customer/customer/entities/customer.entity';
import { UserRole } from '../../iam/user-role/entities/user-role.entity';
import { RolePermission } from '../../iam/role-permission/entities/role-permission.entity';
import { Permission } from '../../iam/permission/entities/permission.entity';

@Module({
  imports: [
    CoreModule,
    TypeOrmModule.forFeature([
      TypeCredit,
      TypeGuaranty,
      User,
      Customer,
      UserRole,
      RolePermission,
      Permission,
    ]),
  ],
  providers: [
    TypeCreditService,
    TypeGuarantyService,
    UsersService,
    UserRolesService,
    RolePermissionService,
    PermissionsService,
  ],
  controllers: [TypeCreditController, TypeGuarantyController],
})
export class TypeCreditModule {}
