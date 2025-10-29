import { Module } from '@nestjs/common';


import { TypeOrmModule } from '@nestjs/typeorm';

import { DossiersModule } from '../dossiers/dossiers.module';
import { Step } from './entities/step.entity';
import { StepsController } from './step.controller';
import { StepsService } from './step.service';
import { IamModule } from '../iam/iam.module';




@Module({
  
  imports : [TypeOrmModule.forFeature([Step]),DossiersModule , IamModule],
  controllers: [StepsController],
  providers: [StepsService],
})
export class StepModule {}
