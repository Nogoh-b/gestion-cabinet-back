import { forwardRef, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CabinetModule } from '../cabinet/cabinet.module';












import { CustomerModule } from '../customer/customer.module';
import { DocumentCategoryModule } from '../document-category/document-category.module';
import { DossiersModule } from '../dossiers/dossiers.module';
import { IamModule } from '../iam/iam.module';
import { DocumentCustomerController } from './document-customer/document-customer.controller';
import { DocumentCustomerService } from './document-customer/document-customer.service';
import { DocumentCustomer } from './document-customer/entities/document-customer.entity';
import { DocumentTypeController } from './document-type/document-type.controller';
import { DocumentTypeService } from './document-type/document-type.service';
import { DocumentType } from './document-type/entities/document-type.entity';
import { DocumentStatsService } from './document-customer/document-stats.service';
import { DocumentTypeStatsService } from './document-type/document-type-stats.service';
import { ProcedureModule } from '../procedure/procedure.module';
import { DocumentCustomerSubscriber } from './document-customer/subscribers/document-customer.subscriber';
import { PlansModule } from '../plans/plans.module';
import { DocumentVersion } from './document-customer/entities/document-version.entity';
import { DocumentVersionService } from './document-customer/document-version.service';
import { AntivirusScannerService } from './document-customer/antivirus-scanner.service';













@Module({
  imports: [
    TypeOrmModule.forFeature([DocumentType, DocumentCustomer, DocumentVersion]),
    DocumentCategoryModule,
    forwardRef(() => CustomerModule),
    forwardRef(() => DossiersModule),
    forwardRef(() => ProcedureModule),
    CabinetModule,
    forwardRef(() => IamModule),
    PlansModule,
  ],
  controllers: [DocumentTypeController, DocumentCustomerController],
  providers: [DocumentTypeService, DocumentCustomerService, DocumentVersionService, AntivirusScannerService, DocumentStatsService, DocumentTypeStatsService, DocumentCustomerSubscriber],
  exports: [DocumentTypeService, DocumentCustomerService, DocumentVersionService, AntivirusScannerService, DocumentStatsService, TypeOrmModule],
})
export class DocumentsModule {}
