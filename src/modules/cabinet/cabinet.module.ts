import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CabinetController } from './cabinet.controller';
import { CabinetService } from './cabinet.service';
import { Cabinet } from './entities/cabinet.entity';
import { CabinetSubscriber } from './subscribers/cabinet.subscriber';
import { TenantSeederService } from './tenant-seeder.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Cabinet]),
  ],
  providers: [CabinetService, TenantSeederService, CabinetSubscriber],
  controllers: [CabinetController],
  exports: [CabinetService, TenantSeederService],
})
export class CabinetModule {}
