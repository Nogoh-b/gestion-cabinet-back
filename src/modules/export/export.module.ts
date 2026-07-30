import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Dossier } from '../dossiers/entities/dossier.entity';
import { DocumentCustomer } from '../documents/document-customer/entities/document-customer.entity';
import { DocumentVersion } from '../documents/document-customer/entities/document-version.entity';
import { Facture } from '../facture/entities/facture.entity';
import { Paiement } from '../paiement/entities/paiement.entity';
import { Audience } from '../audiences/entities/audience.entity';
import { Diligence } from '../diligence/entities/diligence.entity';
import { StageVisit } from '../procedure/entities/stage-visit.entity';
import { IamModule } from '../iam/iam.module';
import { DossierExportService } from './dossier-export.service';
import { ExportController } from './export.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Dossier,
      DocumentCustomer,
      DocumentVersion,
      Facture,
      Paiement,
      Audience,
      Diligence,
      StageVisit,
    ]),
    IamModule, // PermissionsGuard a besoin des services IAM
  ],
  controllers: [ExportController],
  providers: [DossierExportService],
})
export class ExportModule {}
