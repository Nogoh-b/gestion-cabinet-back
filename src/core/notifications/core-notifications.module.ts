import { EmailsModule } from 'src/core/shared/emails/emails.module';
import { UserRoleAssignment } from 'src/modules/iam/user-role-assignment/entities/user-role-assignment.entity';
import { User } from 'src/modules/iam/user/entities/user.entity';
import { MailTemplateModule } from 'src/modules/mail-template/mail-template.module';
import { NotificationModule } from 'src/modules/notification/notification.module';
import { UserSettings } from 'src/modules/settings/entities/user-settings.entity';
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { NotificationDispatcher } from './notification-dispatcher.service';

/**
 * Module global du dispatcher de notifications.
 *
 * Le dispatcher est consommé par les `*.subscriber.ts` métier ; les modules
 * concernés (dossiers, facture, paiement, audiences, ...) doivent simplement
 * importer ce module et injecter `NotificationDispatcher`.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([User, UserRoleAssignment, UserSettings]),
    forwardRef(() => NotificationModule),
    EmailsModule,
    MailTemplateModule,
  ],
  providers: [NotificationDispatcher],
  exports: [NotificationDispatcher],
})
export class CoreNotificationsModule {}
