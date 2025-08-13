import { CoreModule } from 'src/core/core.module';
import { forwardRef, Module } from '@nestjs/common';



import { TypeOrmModule } from '@nestjs/typeorm';











import { GeographyModule } from '../geography/geography.module';
import { IamModule } from '../iam/iam.module';
import { SavingsAccountModule } from '../savings-account/savings-account.module';
import { BranchController } from './branch/branch.controller';
import { BranchService } from './branch/branch.service';
import { Branch } from './branch/entities/branch.entity';
import { EmployeeController } from './employee/employee.controller';
import { EmployeeService } from './employee/employee.service';
import { Employee } from './employee/entities/employee.entity';
import { CustomerModule } from '../customer/customer.module';









@Module({
  imports: [
    forwardRef(() => CoreModule),
    forwardRef(() => GeographyModule),
    forwardRef(() =>  SavingsAccountModule),
    forwardRef(() => CustomerModule),
    forwardRef(() => IamModule),
    TypeOrmModule.forFeature([Branch, Employee]),

  ],
  controllers: [BranchController, EmployeeController],
  providers: [BranchService, EmployeeService],
  exports: [BranchService, EmployeeService, TypeOrmModule],
})
export class AgenciesModule {}
