import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cabinet } from '../cabinet/entities/cabinet.entity';
import { UserSettings } from './entities/user-settings.entity';
import { AppSettingsService } from './services/app-settings.service';
import { UserSettingsService } from './services/user-settings.service';
import { AppSettingsController } from './controllers/app-settings.controller';
import { UserSettingsController } from './controllers/user-settings.controller';
import { EmailsModule } from 'src/core/shared/emails/emails.module';

@Module({
  imports: [
    // La configuration cabinet vit désormais dans la table `cabinets`.
    TypeOrmModule.forFeature([Cabinet, UserSettings]),
    EmailsModule,
  ],
  controllers: [AppSettingsController, UserSettingsController],
  providers: [AppSettingsService, UserSettingsService],
  exports: [AppSettingsService, UserSettingsService, TypeOrmModule],
})
export class SettingsModule {}
