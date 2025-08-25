import { Module } from '@nestjs/common';
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
import { TypeCreditController } from './type_credit/typeCredit.controller';
import { LoanController } from './loan/loan.controller';
import { TypeGuarantyController } from './guaranty/type_guaranty/type_guaranty.controller';
import { GuarantyEstimationController } from './guaranty/garanty_estimation/guaranty_estimation.controller';
import { TypeCreditService } from './type_credit/typeCredit.service';
import { TypeGuarantyService } from './guaranty/type_guaranty/type_guaranty.service';
import { LoanService } from './loan/loan.service';
import { GuarantyEstimationService } from './guaranty/garanty_estimation/guaranty_estimation.service';
import { TypeCredit } from './type_credit/entities/typeCredit.entity';
import { TypeGuaranty } from './guaranty/type_guaranty/entity/type_guaranty.entity';
import { GuarantyEstimation } from './guaranty/garanty_estimation/entity/guaranty_estimation.entity';
import { Loan } from './loan/entities/loan.entity';
import { CustomersService } from '../customer/customer/customer.service';
import { DocumentType } from '../documents/document-type/entities/document-type.entity';
import { TypeCustomer } from '../customer/type-customer/entities/type_customer.entity';
import { TypeCustomersService } from '../customer/type-customer/type-customer.service';
import { SavingsAccountService } from '../savings-account/savings-account/savings-account.service';
import { CustomerModule } from '../customer/customer.module';
import { DocumentCustomer } from '../documents/document-customer/entities/document-customer.entity';
import { DocumentsModule } from '../documents/documents.module';
import { TransactionModule } from '../transaction/transaction.module';
import { SavingsAccount } from '../savings-account/savings-account/entities/savings-account.entity';
import { LoanSubscriber } from './loan/subscribers/loan.subscriber';
import { JobsService } from '../../core/scheduler/jobs.service';
import { AgenciesModule } from '../agencies/agencies.module';
import { EmployeeService } from '../agencies/employee/employee.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      User,
      Customer,
      UserRole,
      RolePermission,
      Permission,
      TypeCredit,
      TypeGuaranty,
      GuarantyEstimation,
      Loan,
      DocumentType,
      DocumentCustomer,
      TypeCustomer,
      SavingsAccount,
    ]),
    CustomerModule,
    DocumentsModule,
    TransactionModule,
    AgenciesModule,
  ],
  controllers: [
    TypeCreditController,
    LoanController,
    TypeGuarantyController,
    GuarantyEstimationController,
  ],
  providers: [
    TypeCreditService,
    TypeGuarantyService,
    LoanService,
    GuarantyEstimationService,
    UsersService,
    UserRolesService,
    RolePermissionService,
    PermissionsService,
    LoanSubscriber,
    JobsService,
    EmployeeService,
  ],
})
export class CreditModule {}
