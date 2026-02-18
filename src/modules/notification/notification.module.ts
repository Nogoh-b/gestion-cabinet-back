// src/modules/notification/notification.module.ts
import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { NotificationService } from './notification.service';
import { NotificationController } from './notification.controller';
import { User } from '../iam/user/entities/user.entity';
import { NotificationGateway } from './gateways/notification.gateway';
import { ChatModule } from '../chat/chat.module';
import { DossiersModule } from '../dossiers/dossiers.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Notification, User]),
    forwardRef(() => DossiersModule), // Pour éviter les dépendances circulaires
    forwardRef(() => ChatModule) // Pour éviter les dépendances circulaires
  ],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationGateway],
  exports: [NotificationService]
})
export class NotificationModule {}