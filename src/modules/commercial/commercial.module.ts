import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { CommercialController } from './commercial.controller';
import { CommercialService } from './commercial.service';
import { Commercial } from './entities/commercial.entity';


@Module({
  controllers: [CommercialController],
  providers: [CommercialService],
  exports: [CommercialService],
  imports: [TypeOrmModule.forFeature([
          Commercial
        ]),],
})
export class CommercialModule {}
