import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Cabinet } from 'src/modules/cabinet/entities/cabinet.entity';
import { Audience } from 'src/modules/audiences/entities/audience.entity';
import { Diligence } from 'src/modules/diligence/entities/diligence.entity';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { NotificationModule } from 'src/modules/notification/notification.module';

import { ReminderScheduler } from './reminder.scheduler';
import { AudienceReminderDeliveryService } from './audience-reminder-delivery.service';

/**
 * Planificateur d'alertes proactives (rappels d'audience, échéances de
 * diligences, délais de recours). TenantContext provient de CoreModule (@Global)
 * et ScheduleModule.forRoot() est déjà initialisé dans AppModule.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Cabinet, Audience, Diligence, Dossier]),
    NotificationModule,
  ],
  providers: [ReminderScheduler, AudienceReminderDeliveryService],
})
export class ReminderSchedulerModule {}
