import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Branch } from './branch/entities/branch.entity';
import { Employee } from './employee/entities/employee.entity';
import { IamModule } from '../iam/iam.module';
import { GeographyModule } from '../geography/geography.module';
import { EmployeeController } from './employee/employee.controller';
import { BranchController } from './branch/branch.controller';
import { BranchService } from './branch/branch.service';
import { EmployeeService } from './employee/employee.service';
import { CoreModule } from 'src/core/core.module';

@Module({
  imports: [
    IamModule,
    CoreModule,
    GeographyModule,
    TypeOrmModule.forFeature([Branch, Employee]),
  ],
  controllers:[BranchController, EmployeeController],
  providers : [
    BranchService,
    EmployeeService
  ],
  exports:[
    BranchService,
    EmployeeService
  ]
})
export class AgenciesModule {}
