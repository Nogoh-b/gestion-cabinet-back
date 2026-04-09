import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { InvoiceType } from './entities/invoice-type.entity';
import { InvoiceTypeController } from './invoice-type.controller';
import { InvoiceTypeService } from './invoice-type.service';
import { InvoiceTypeStatsService } from './invoice-type-stats.service';


@Module({
    imports : [
          TypeOrmModule.forFeature([InvoiceType]),
      
    ],
    exports :[InvoiceTypeService],
  controllers: [InvoiceTypeController],
  providers: [InvoiceTypeService, InvoiceTypeStatsService],
})
export class InvoiceTypeModule {}
