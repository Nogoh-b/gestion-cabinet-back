import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoreModule } from 'src/core/core.module';
import { TypeCredit } from './entities/typeCredit.entity';
import { TypeCreditService } from './typeCredit.service';
import { TypeCreditController } from './typeCredit.controller';

@Module({
  imports: [CoreModule, TypeOrmModule.forFeature([TypeCredit])],
  providers: [TypeCreditService],
  controllers: [TypeCreditController],
})
export class TypeCreditModule {}
