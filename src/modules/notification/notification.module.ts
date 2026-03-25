// src/modules/notification/notification.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { User } from '../iam/user/entities/user.entity';
import { DossiersModule } from '../dossiers/dossiers.module';
import { UserNotification } from './entities/user-notification.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, User, UserNotification]),
    // CoreModule,
    forwardRef(() => DossiersModule), // Pour éviter les dépendances circulaires
  ],
  controllers: [NotificationController],
  providers: [NotificationService],
  exports: [NotificationService]
})
export class NotificationModule {}