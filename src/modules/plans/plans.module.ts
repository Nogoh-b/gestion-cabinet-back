import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Plan } from './entities/plan.entity';
import { PlansService } from './plans.service';
import { PlansController } from './plans.controller';
import { PlanQuotaService } from './plan-quota.service';
import { Cabinet } from 'src/modules/cabinet/entities/cabinet.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Plan, Cabinet])],
  controllers: [PlansController],
  providers: [PlansService, PlanQuotaService],
  exports: [PlansService, PlanQuotaService],
})
export class PlansModule {}
