import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';

// Entities
import { PayrollPeriod } from './entities/payroll-period.entity';
import { Payslip } from './entities/payslip.entity';
import { PayslipLine } from './entities/payslip-line.entity';
import { PayrollContribution } from './entities/payroll-contribution.entity';
import { SalaryAdvance } from './entities/salary-advance.entity';
import { EmployeeLeave } from './entities/employee-leave.entity';
import { User } from '../iam/user/entities/user.entity';

// Services
import { PayrollPeriodsService } from './payroll-periods.service';
import { PayslipsService } from './payslips.service';
import { PayslipLinesService } from './payslip-lines.service';
import { PayrollContributionsService } from './payroll-contributions.service';
import { SalaryAdvancesService } from './salary-advances.service';
import { EmployeeLeavesService } from './employee-leaves.service';
import { PayrollCalculatorService } from './services/payroll-calculator.service';
import { PayrollGenerationService } from './services/payroll-generation.service';
import { PayrollStatsService } from './services/payroll-stats.service';
import { HrNotificationsService } from './services/hr-notifications.service';

// Controllers
import { PayrollPeriodsController } from './payroll-periods.controller';
import { PayslipsController } from './payslips.controller';
import { PayslipLinesController } from './payslip-lines.controller';
import { PayrollContributionsController } from './payroll-contributions.controller';
import { SalaryAdvancesController } from './salary-advances.controller';
import { EmployeeLeavesController } from './employee-leaves.controller';

// Dépendances externes
import { DossiersModule } from '../dossiers/dossiers.module';
import { NotificationModule } from '../notification/notification.module';
import { AgenciesModule } from '../agencies/agencies.module';
import { PlansModule } from '../plans/plans.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      PayrollPeriod,
      Payslip,
      PayslipLine,
      PayrollContribution,
      SalaryAdvance,
      EmployeeLeave,
      // Notifications RH : résolution des administrateurs destinataires.
      User,
    ]),
    AgenciesModule,
    DossiersModule,
    PlansModule,
    NotificationModule,
  ],
  controllers: [
    PayrollPeriodsController,
    PayslipsController,
    PayslipLinesController,
    PayrollContributionsController,
    SalaryAdvancesController,
    EmployeeLeavesController,
  ],
  providers: [
    PaginationServiceV1,
    PayrollPeriodsService,
    PayslipsService,
    PayslipLinesService,
    PayrollContributionsService,
    SalaryAdvancesService,
    EmployeeLeavesService,
    PayrollCalculatorService,
    PayrollGenerationService,
    PayrollStatsService,
    HrNotificationsService,
  ],
  exports: [
    PayrollPeriodsService,
    PayslipsService,
    PayslipLinesService,
    PayrollContributionsService,
    SalaryAdvancesService,
    EmployeeLeavesService,
    PayrollCalculatorService,
    PayrollGenerationService,
    PayrollStatsService,
  ],
})
export class PayrollModule {}
