import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';

// Entities
import { PayrollPeriod } from './entities/payroll-period.entity';
import { Payslip } from './entities/payslip.entity';
import { PayslipLine } from './entities/payslip-line.entity';

// Services
import { PayrollPeriodsService } from './payroll-periods.service';
import { PayslipsService } from './payslips.service';
import { PayslipLinesService } from './payslip-lines.service';

// Controllers
import { PayrollPeriodsController } from './payroll-periods.controller';
import { PayslipsController } from './payslips.controller';
import { PayslipLinesController } from './payslip-lines.controller';

// Dépendances externes
import { DossiersModule } from '../dossiers/dossiers.module';
import { AgenciesModule } from '../agencies/agencies.module';
import { PlansModule } from '../plans/plans.module';
import { AiDatabaseModule } from 'src/core/ai-database/ai-database.module';
import { WriteHandlerRegistry } from 'src/core/ai-database/write/write-handler.registry';
import { PayrollPeriodWriteHandler } from './payroll-period-write.handler';
import { PayslipWriteHandler } from './payslip-write.handler';
import { PayslipLineWriteHandler } from './payslip-line-write.handler';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PayrollPeriod,
      Payslip,
      PayslipLine,
    ]),
    AgenciesModule,
    DossiersModule,
    PlansModule,
    AiDatabaseModule,
  ],
  controllers: [
    PayrollPeriodsController,
    PayslipsController,
    PayslipLinesController,
  ],
  providers: [
    PaginationServiceV1,
    PayrollPeriodsService,
    PayslipsService,
    PayslipLinesService,
    PayrollPeriodWriteHandler,
    PayslipWriteHandler,
    PayslipLineWriteHandler,
  ],
  exports: [
    PayrollPeriodsService,
    PayslipsService,
    PayslipLinesService,
  ],
})
export class PayrollModule {
  constructor(
    private readonly registry: WriteHandlerRegistry,
    private readonly periodHandler: PayrollPeriodWriteHandler,
    private readonly payslipHandler: PayslipWriteHandler,
    private readonly lineHandler: PayslipLineWriteHandler,
  ) {}

  onModuleInit() {
    this.registry.register(this.periodHandler);
    this.registry.register(this.payslipHandler);
    this.registry.register(this.lineHandler);
  }
}