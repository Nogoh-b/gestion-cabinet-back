import { Module } from '@nestjs/common';
import { GlobalSearchController } from './search.controller';
import { GlobalSearchService } from './search.service';
import { MentionSearchService } from './mention-search.service';
import { AgenciesModule } from '../agencies/agencies.module';
import { AudiencesModule } from '../audiences/audiences.module';
import { CustomerModule } from '../customer/customer.module';
import { DiligenceModule } from '../diligence/diligence.module';
import { DocumentsModule } from '../documents/documents.module';
import { DossiersModule } from '../dossiers/dossiers.module';
import { FactureModule } from '../facture/facture.module';
import { ReferralModule } from '../referral/referral.module';
import { SupplierModule } from '../supplier/supplier.module';
import { PdfTemplatesModule } from '../pdf-templates/pdf-templates.module';
import { MailTemplateModule } from '../mail-template/mail-template.module';

@Module({
  // Recherches des catégories du menu @ (MentionSearchService).
  imports: [
    AgenciesModule,
    AudiencesModule,
    CustomerModule,
    DiligenceModule,
    DocumentsModule,
    DossiersModule,
    FactureModule,
    ReferralModule,
    SupplierModule,
    PdfTemplatesModule,
    MailTemplateModule,
  ],
  controllers: [GlobalSearchController],
  providers: [GlobalSearchService, MentionSearchService],
})
export class GlobalSearchModule {}
