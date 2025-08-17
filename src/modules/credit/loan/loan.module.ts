import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CoreModule } from 'src/core/core.module';
import { LoanService } from './loan.service';
import { LoanController } from './loan.controller';
import { Loan } from './entities/loan.entity';
import { GuarantyEstimationController } from '../guaranty/garanty_estimation/guaranty_estimation.controller';
import { GuarantyEstimationService } from '../guaranty/garanty_estimation/guaranty_estimation.service';
import { GuarantyEstimation } from '../guaranty/garanty_estimation/entity/guaranty_estimation.entity';

@Module({
  imports: [CoreModule, TypeOrmModule.forFeature([Loan, GuarantyEstimation])],
  providers: [LoanService, GuarantyEstimationService],
  controllers: [LoanController, GuarantyEstimationController],
})
export class LoanModule {}
