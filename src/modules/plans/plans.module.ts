import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Plan } from './entities/plan.entity';
import { PlansService } from './plans.service';
import { PlansController } from './plans.controller';
import { PlanQuotaService } from './plan-quota.service';
import { AiCreditPack } from './ai-credits/ai-credit-pack.entity';
import { AiCreditsService } from './ai-credits/ai-credits.service';
import { Cabinet } from 'src/modules/cabinet/entities/cabinet.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Plan, Cabinet, AiCreditPack])],
  controllers: [PlansController],
  providers: [PlansService, PlanQuotaService, AiCreditsService],
  exports: [PlansService, PlanQuotaService, AiCreditsService],
})
export class PlansModule {}
