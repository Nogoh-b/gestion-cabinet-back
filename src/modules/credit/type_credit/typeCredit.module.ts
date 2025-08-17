import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoreModule } from 'src/core/core.module';
import { TypeCredit } from './entities/typeCredit.entity';
import { TypeCreditService } from './typeCredit.service';
import { TypeCreditController } from './typeCredit.controller';
import { TypeGuarantyController } from '../guaranty/type_guaranty/type_guaranty.controller';
import { TypeGuarantyService } from '../guaranty/type_guaranty/type_guaranty.service';
import { TypeGuaranty } from '../guaranty/type_guaranty/entity/type_guaranty.entity';

@Module({
  imports: [CoreModule, TypeOrmModule.forFeature([TypeCredit, TypeGuaranty])],
  providers: [TypeCreditService, TypeGuarantyService],
  controllers: [TypeCreditController, TypeGuarantyController],
})
export class TypeCreditModule {}
