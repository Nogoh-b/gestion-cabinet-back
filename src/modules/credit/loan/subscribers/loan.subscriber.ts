import {
  DataSource,
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
  UpdateEvent,
} from 'typeorm';
import { Loan } from '../entities/loan.entity';
import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import { TransactionSavingsAccountService } from '../../../transaction/transaction_saving_account/transaction_saving_account.service';
import { Branch } from '../../../agencies/branch/entities/branch.entity';
import { BranchService } from '../../../agencies/branch/branch.service';
import { SavingsAccountService } from '../../../savings-account/savings-account/savings-account.service';
import { SavingsAccount } from '../../../savings-account/savings-account/entities/savings-account.entity';
import { CreateCreditTransactionSavingsAccountDto } from '../../../transaction/transaction_saving_account/dto/create-transaction_saving_account.dto';
import { JobsService } from '../../../../core/scheduler/jobs.service';
import { getCronTime } from '../../../../utils/utils';

@Injectable()
@EventSubscriber()
export class LoanSubscriber implements EntitySubscriberInterface<Loan> {
  constructor(
    private readonly transactionSavingAccountService: TransactionSavingsAccountService,
    private readonly jobsService: JobsService,
  ) {}
  listenTo() {
    return Loan;
  }

  async afterInsert(event: InsertEvent<Loan>) {}

  async afterUpdate(event: UpdateEvent<Loan>) {
    console.log('-> transfers the system to account');
    const { entity, manager } = event;
    const loan = entity as Loan;
    console.log('-> transfers the system to account', loan);
    const agency = loan.approvedBy?.employee?.branch;
    if (!agency)
      throw new BadRequestException({
        success: false,
        message: 'No system to approve, branch not identify in this user, please contact administrator',
        status: HttpStatus.BAD_REQUEST,
      });
    const creditAccount = loan.credit_account;
    const transaction =
      await this.transactionSavingAccountService.deposit_loan_to_account({
        amount: loan.amount,
        branch_id: agency.id,
        origin_savings_account_code: agency.code,
        target_savings_account_code: creditAccount.number_savings_account,
      } as any);
    const time = getCronTime(
      transaction.created_at,
      loan.typeCredit.reimbursement_period,
    );
    this.jobsService.addCronJob('jobs-' + transaction.id, time, () => {
      console.log('retrieve trait loan');
    });
  }
}
