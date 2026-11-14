import { ReferenceDataModule } from '../reference-data/reference-data.module';
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cabinet } from '../cabinet/entities/cabinet.entity';
import { UserSettings } from './entities/user-settings.entity';
import { AppSettingsService } from './services/app-settings.service';
import { UserSettingsService } from './services/user-settings.service';
import { AppSettingsController } from './controllers/app-settings.controller';
import { UserSettingsController } from './controllers/user-settings.controller';
import { EmailsModule } from 'src/core/shared/emails/emails.module';
import { AiRequestLog } from 'src/core/ai-database/entities/ai-request-log.entity';
import { Audience } from '../audiences/entities/audience.entity';
import { Customer } from '../customer/customer/entities/customer.entity';
import { DocumentCustomer } from '../documents/document-customer/entities/document-customer.entity';
import { Dossier } from '../dossiers/entities/dossier.entity';
import { Facture } from '../facture/entities/facture.entity';
import { User } from '../iam/user/entities/user.entity';
import { OnboardingChecklistService } from './services/onboarding-checklist.service';
import { OnboardingChecklistController } from './controllers/onboarding-checklist.controller';

@Module({
  imports: [
    ReferenceDataModule,
    // La configuration cabinet vit désormais dans la table `cabinets`.
    TypeOrmModule.forFeature([Cabinet, UserSettings]),
    // Comptages de la liste « Premiers pas ».
    TypeOrmModule.forFeature([Customer, Dossier, Audience, DocumentCustomer, Facture, AiRequestLog, User]),
    EmailsModule,
  ],
  controllers: [AppSettingsController, UserSettingsController, OnboardingChecklistController],
  providers: [AppSettingsService, UserSettingsService, OnboardingChecklistService],
  exports: [AppSettingsService, UserSettingsService, TypeOrmModule],
})
export class SettingsModule {}
