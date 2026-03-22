import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GeographyModule } from '../geography/geography.module';
import { BranchController } from './branch/branch.controller';
import { BranchService } from './branch/branch.service';
import { Branch } from './branch/entities/branch.entity';
import { EmployeeController } from './employee/employee.controller';
import { EmployeeService } from './employee/employee.service';
import { Employee } from './employee/entities/employee.entity';
import { EmployeeStatsService } from './employee/employee-stats.service';
import { BranchStatsService } from './branch/branch-stats.service';
import { CoreModule } from 'src/core/core.module';
import { EmployeeSubscriber } from './employee/suscribers/employee.suscribers';


@Module({
  imports: [
    forwardRef(() => GeographyModule),  // <-- UTILISEZ forwardRef ICI
    forwardRef(() => CoreModule),  // <-- UTILISEZ forwardRef ICI
    TypeOrmModule.forFeature([Branch, Employee]),

  ],
  controllers: [BranchController, EmployeeController],
  providers: [BranchService, EmployeeService,EmployeeStatsService, EmployeeSubscriber, BranchStatsService],
  exports: [BranchService, EmployeeService,EmployeeStatsService, TypeOrmModule, BranchStatsService],
})
export class AgenciesModule {}
