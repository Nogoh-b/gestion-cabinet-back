import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Dossier } from '../dossiers/entities/dossier.entity';
import { Audience } from '../audiences/entities/audience.entity';
import { Facture } from '../facture/entities/facture.entity';
import { Paiement } from '../paiement/entities/paiement.entity';
import { Diligence } from '../diligence/entities/diligence.entity';
import { DocumentCustomer } from '../documents/document-customer/entities/document-customer.entity';
import { ExpenseReport } from '../supplier/entities/expense-report.entity';
import { PlansModule } from '../plans/plans.module';
import { ReportsService } from './reports.service';
import { ReportsController } from './reports.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Dossier,
      Audience,
      Facture,
      Paiement,
      Diligence,
      DocumentCustomer,
      ExpenseReport,
    ]),
    PlansModule,
  ],
  controllers: [ReportsController],
  providers: [ReportsService],
})
export class ReportsModule {}
