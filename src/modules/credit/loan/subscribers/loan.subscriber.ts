import {
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent,
} from 'typeorm';
import { Loan } from '../entities/loan.entity';

@EventSubscriber()
export class LoanSubscriber implements EntitySubscriberInterface<Loan> {
  listenTo() {
    return Loan;
  }

  async afterInsert(event: InsertEvent<Loan>) {

  }
}