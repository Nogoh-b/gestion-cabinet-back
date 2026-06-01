import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { NotificationDispatcher } from './notification-dispatcher.service';
import { User } from 'src/modules/iam/user/entities/user.entity';
import { UserRoleAssignment } from 'src/modules/iam/user-role-assignment/entities/user-role-assignment.entity';
import { UserSettings } from 'src/modules/settings/entities/user-settings.entity';
import { NotificationModule } from 'src/modules/notification/notification.module';
import { EmailsModule } from 'src/core/shared/emails/emails.module';

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
  ],
  providers: [NotificationDispatcher],
  exports: [NotificationDispatcher],
})
export class CoreNotificationsModule {}
