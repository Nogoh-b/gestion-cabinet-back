import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Cabinet } from './entities/cabinet.entity';
import { CabinetService } from './cabinet.service';
import { CabinetController } from './cabinet.controller';
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Cabinet]),
    SettingsModule, // ← pour injecter AppSettingsService
  ],
  providers: [CabinetService],
  controllers: [CabinetController],
  exports: [CabinetService],
})
export class CabinetModule {}
