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
import { EmployeeSubscriber } from './employee/suscribers/employee.suscribers';
import { EmployeeWriteHandler } from './employee/employee-write.handler';
import { WriteHandlerRegistry } from 'src/core/ai-database/write/write-handler.registry';
import { AiDatabaseModule } from 'src/core/ai-database/ai-database.module';


@Module({
  imports: [
    forwardRef(() => GeographyModule),
    TypeOrmModule.forFeature([Branch, Employee]),
    AiDatabaseModule,
  ],
  controllers: [BranchController, EmployeeController],
  providers: [BranchService, EmployeeService, EmployeeStatsService, EmployeeSubscriber, BranchStatsService, EmployeeWriteHandler],
  exports: [BranchService, EmployeeService, EmployeeStatsService, TypeOrmModule, BranchStatsService],
})
export class AgenciesModule {
  constructor(
    private readonly registry: WriteHandlerRegistry,
    private readonly handler: EmployeeWriteHandler,
  ) {}

  onModuleInit() {
    // this.registry.register(this.handler);
  }
}
