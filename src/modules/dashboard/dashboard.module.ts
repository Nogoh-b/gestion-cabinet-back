import { Module } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { DashboardController } from './dashboard.controller';
import { DossiersModule } from '../dossiers/dossiers.module';
import { AudiencesModule } from '../audiences/audiences.module';
import { DiligenceModule } from '../diligence/diligence.module';
import { DocumentsModule } from '../documents/documents.module';
import { FactureModule } from '../facture/facture.module';
import { CustomerModule } from '../customer/customer.module';
import { AgenciesModule } from '../agencies/agencies.module';
import { JurisdictionModule } from '../jurisdiction/jurisdiction.module';

@Module({
  controllers: [DashboardController],
  providers: [DashboardService],
  imports :[DossiersModule,AudiencesModule,DiligenceModule,DocumentsModule,FactureModule,CustomerModule,AgenciesModule,JurisdictionModule]
})
export class DashboardModule {}
