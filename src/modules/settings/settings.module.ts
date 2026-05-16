import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppSettings } from './entities/app-settings.entity';
import { UserSettings } from './entities/user-settings.entity';
import { AppSettingsService } from './services/app-settings.service';
import { UserSettingsService } from './services/user-settings.service';
import { AppSettingsController } from './controllers/app-settings.controller';
import { UserSettingsController } from './controllers/user-settings.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([AppSettings, UserSettings]),
  ],
  controllers: [AppSettingsController, UserSettingsController],
  providers: [AppSettingsService, UserSettingsService],
  exports: [AppSettingsService, UserSettingsService, TypeOrmModule],
})
export class SettingsModule {}