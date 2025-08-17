import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoreModule } from 'src/core/core.module';
import { LoanService } from './loan.service';
import { LoanController } from './loan.controller';
import { Loan } from './entities/loan.entity';
import { GuarantyEstimationController } from '../guaranty/garanty_estimation/guaranty_estimation.controller';
import { GuarantyEstimationService } from '../guaranty/garanty_estimation/guaranty_estimation.service';
import { GuarantyEstimation } from '../guaranty/garanty_estimation/entity/guaranty_estimation.entity';
import { User } from '../../iam/user/entities/user.entity';
import { Customer } from '../../customer/customer/entities/customer.entity';
import { UserRole } from '../../iam/user-role/entities/user-role.entity';
import { RolePermission } from '../../iam/role-permission/entities/role-permission.entity';
import { Permission } from '../../iam/permission/entities/permission.entity';
import { UsersService } from '../../iam/user/user.service';
import { UserRolesService } from '../../iam/user-role/user-role.service';
import { RolePermissionService } from '../../iam/role-permission/role-permission.service';
import { PermissionsService } from '../../iam/permission/permission.service';

@Module({
  imports: [
    CoreModule,
    TypeOrmModule.forFeature([
      Loan,
      GuarantyEstimation,
      User,
      Customer,
      UserRole,
      RolePermission,
      Permission,
    ]),
  ],
  providers: [
    LoanService,
    GuarantyEstimationService,
    UsersService,
    UserRolesService,
    RolePermissionService,
    PermissionsService,],
  controllers: [LoanController, GuarantyEstimationController],
})
export class LoanModule {}
