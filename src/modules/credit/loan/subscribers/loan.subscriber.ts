import {
  DataSource,
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
  UpdateEvent,
} from 'typeorm';
import { Loan } from '../entities/loan.entity';
import {
  BadRequestException,
  HttpStatus,
  Inject,
  Injectable,
} from '@nestjs/common';
import { TransactionSavingsAccountService } from '../../../transaction/transaction_saving_account/transaction_saving_account.service';
import { Branch } from '../../../agencies/branch/entities/branch.entity';
import { BranchService } from '../../../agencies/branch/branch.service';
import { SavingsAccountService } from '../../../savings-account/savings-account/savings-account.service';
import { SavingsAccount } from '../../../savings-account/savings-account/entities/savings-account.entity';
import { CreateCreditTransactionSavingsAccountDto } from '../../../transaction/transaction_saving_account/dto/create-transaction_saving_account.dto';
import { JobsService } from '../../../../core/scheduler/jobs.service';
import { getCronTime } from '../../../../utils/utils';
import { EmployeeService } from '../../../agencies/employee/employee.service';
import { Employee } from '../../../agencies/employee/entities/employee.entity';

@Injectable()
@EventSubscriber()
export class LoanSubscriber implements EntitySubscriberInterface<Loan> {
  constructor(
    private readonly transactionSavingAccountService: TransactionSavingsAccountService,
    private readonly jobsService: JobsService,
    private readonly employeeService: EmployeeService,
  ) {}
  listenTo() {
    return Loan;
  }

  async afterInsert(event: InsertEvent<Loan>) {}

  async afterUpdate(event: UpdateEvent<Loan>) {

  }
}
