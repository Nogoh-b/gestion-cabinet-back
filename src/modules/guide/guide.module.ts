import { Module } from '@nestjs/common';
import { PlansModule } from 'src/modules/plans/plans.module';
import { GuideController } from './guide.controller';
import { GuideService } from './guide.service';

@Module({
  imports: [PlansModule],
  controllers: [GuideController],
  providers: [GuideService],
})
export class GuideModule {}
