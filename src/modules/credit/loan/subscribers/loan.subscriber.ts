import {
  EntitySubscriberInterface,
  EventSubscriber,
  InsertEvent, UpdateEvent,
} from 'typeorm';
import { Loan } from '../entities/loan.entity';

@EventSubscriber()
export class LoanSubscriber implements EntitySubscriberInterface<Loan> {
  listenTo() {
    return Loan;
  }

  async afterInsert(event: InsertEvent<Loan>) {

  }

  async afterUpdate(event: UpdateEvent<Loan>) {
    console.log("update loan approve")
  }
}