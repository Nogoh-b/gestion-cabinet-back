import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoreModule } from 'src/core/core.module';
import { CreditService } from './credit.service';
import { CreditController } from './credit.controller';
import { Credit } from './entities/credit.entity';

@Module({
  imports: [CoreModule, TypeOrmModule.forFeature([Credit])],
  providers: [CreditService],
  controllers: [CreditController],
})
export class CreditModule {}
