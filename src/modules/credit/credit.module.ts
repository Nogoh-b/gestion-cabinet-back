import { Module } from '@nestjs/common';
import { TypeCreditModule } from './type_credit/typeCredit.module';
import { LoanModule } from './loan/loan.module';

@Module({
  imports: [LoanModule, TypeCreditModule],
})
export class CreditModule {}
