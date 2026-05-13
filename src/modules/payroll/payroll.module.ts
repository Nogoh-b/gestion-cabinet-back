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

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PayrollPeriod,
      Payslip,
      PayslipLine,
    ]),
    AgenciesModule,
    DossiersModule
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
  ],
  exports: [
    PayrollPeriodsService,
    PayslipsService,
    PayslipLinesService,
  ],
})
export class PayrollModule {}