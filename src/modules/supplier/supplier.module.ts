import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';

// Entities
import { Supplier } from './entities/supplier.entity';
import { SupplierInvoice } from './entities/supplier-invoice.entity';
import { ExpenseReport } from './entities/expense-report.entity';
import { ExpenseLine } from './entities/expense-line.entity';

// Services
import { SupplierInvoicesService } from './supplier-invoices.service';
import { ExpenseReportsService } from './expense-reports.service';
import { ExpenseLinesService } from './expense-lines.service';

// Controllers
import { SupplierInvoicesController } from './supplier-invoices.controller';
import { ExpenseReportsController } from './expense-reports.controller';
import { ExpenseLinesController } from './expense-lines.controller';
import { ExpensesController } from './expenses.controller';

// Dépendances externes
import { AgenciesModule } from '../agencies/agencies.module';
import { IamModule } from '../iam/iam.module';
import { DossiersModule } from '../dossiers/dossiers.module';
import { SuppliersController } from './supplier.controller';
import { SuppliersService } from './supplier.service';
import { SupplierInvoiceWriteHandler } from './supplier-invoice-write.handler';
import { ExpenseReportWriteHandler } from './expense-report-write.handler';
import { ExpenseLineWriteHandler } from './expense-line-write.handler';
import { WriteHandlerRegistry } from 'src/core/ai-database/write/write-handler.registry';
import { AiDatabaseModule } from 'src/core/ai-database/ai-database.module';
import { PlansModule } from '../plans/plans.module';
import { CaseWorkflowModule } from '../case-workflow/case-workflow.module';
import { ExpenseWorkspaceService } from './expense-workspace.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Supplier,
      SupplierInvoice,
      ExpenseReport,
      ExpenseLine,
    ]),
    AgenciesModule,
    IamModule,
    DossiersModule,
    AiDatabaseModule,
    PlansModule,
    forwardRef(() => CaseWorkflowModule),
  ],
  controllers: [
    SuppliersController,
    SupplierInvoicesController,
    ExpenseReportsController,
    ExpenseLinesController,
    ExpensesController,
  ],
  providers: [
    PaginationServiceV1,
    SuppliersService,
    SupplierInvoicesService,
    ExpenseReportsService,
    ExpenseLinesService,
    ExpenseWorkspaceService,
    SupplierInvoiceWriteHandler,
    ExpenseReportWriteHandler,
    ExpenseLineWriteHandler,
  ],
  exports: [
    SuppliersService,
    SupplierInvoicesService,
    ExpenseReportsService,
    ExpenseLinesService,
    ExpenseWorkspaceService,
  ],
})
export class SupplierModule {
  constructor(
    private readonly registry: WriteHandlerRegistry,
    private readonly supplierInvoiceWriteHandler: SupplierInvoiceWriteHandler,
    private readonly expenseReportWriteHandler: ExpenseReportWriteHandler,
    private readonly expenseLineWriteHandler: ExpenseLineWriteHandler,
  ) {}

  onModuleInit() {
    this.registry.register(this.supplierInvoiceWriteHandler);
    this.registry.register(this.expenseReportWriteHandler);
    this.registry.register(this.expenseLineWriteHandler);
  }
}
