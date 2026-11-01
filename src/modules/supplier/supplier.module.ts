import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { PaginationServiceV1 } from 'src/core/shared/services/pagination/paginations-v1.service';

// Entities
import { Supplier } from './entities/supplier.entity';
import { SupplierInvoice } from './entities/supplier-invoice.entity';
import { ExpenseReport } from './entities/expense-report.entity';
import { ExpenseLine } from './entities/expense-line.entity';
import { ExpenseCategoryEntity } from './entities/expense-category.entity';

// Services
import { SupplierInvoicesService } from './supplier-invoices.service';
import { ExpenseReportsService } from './expense-reports.service';
import { ExpenseLinesService } from './expense-lines.service';

// Controllers
import { SupplierInvoicesController } from './supplier-invoices.controller';
import { ExpenseReportsController } from './expense-reports.controller';
import { ExpenseLinesController } from './expense-lines.controller';
import { ExpensesController } from './expenses.controller';
import { ExpenseCategoriesController } from './expense-categories.controller';
import { ExpenseCategoriesService } from './expense-categories.service';

// Dépendances externes
import { AgenciesModule } from '../agencies/agencies.module';
import { IamModule } from '../iam/iam.module';
import { DossiersModule } from '../dossiers/dossiers.module';
import { SuppliersController } from './supplier.controller';
import { SuppliersService } from './supplier.service';
import { PlansModule } from '../plans/plans.module';
import { DocumentsModule } from '../documents/documents.module';
import { SupplierEvidenceStorageService } from './supplier-evidence-storage.service';
import { CaseWorkflowModule } from '../case-workflow/case-workflow.module';
import { ExpenseWorkspaceService } from './expense-workspace.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Supplier,
      SupplierInvoice,
      ExpenseReport,
      ExpenseLine,
      ExpenseCategoryEntity,
    ]),
    AgenciesModule,
    IamModule,
    DossiersModule,
    PlansModule,
    DocumentsModule,
    forwardRef(() => CaseWorkflowModule),
  ],
  controllers: [
    SuppliersController,
    SupplierInvoicesController,
    ExpenseReportsController,
    ExpenseLinesController,
    ExpensesController,
    ExpenseCategoriesController,
  ],
  providers: [
    PaginationServiceV1,
    SuppliersService,
    SupplierInvoicesService,
    ExpenseReportsService,
    ExpenseLinesService,
    SupplierEvidenceStorageService,
    ExpenseWorkspaceService,
    ExpenseCategoriesService,
  ],
  exports: [
    SuppliersService,
    SupplierInvoicesService,
    ExpenseReportsService,
    ExpenseLinesService,
    ExpenseWorkspaceService,
    ExpenseCategoriesService,
  ],
})
export class SupplierModule {}
