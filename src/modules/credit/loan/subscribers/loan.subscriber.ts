import {
  DataSource,
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
  UpdateEvent,
} from 'typeorm';
import { Loan } from '../entities/loan.entity';
import { Injectable } from '@nestjs/common';
import {
  TransactionSavingsAccountService
} from '../../../transaction/transaction_saving_account/transaction_saving_account.service';

@Injectable()
@EventSubscriber()
export class LoanSubscriber implements EntitySubscriberInterface<Loan> {
  constructor(
    private readonly transactionSavingAccountService: TransactionSavingsAccountService,
  ) {}
  listenTo() {
    return Loan;
  }

  async afterInsert(event: InsertEvent<Loan>) {}

  async afterUpdate(event: UpdateEvent<Loan>) {
    console.log('-> transfers the system to account');
  }
}
