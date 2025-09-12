import {
  EntitySubscriberInterface,
  EventSubscriber,
  UpdateEvent,
} from 'typeorm';
import { Injectable } from '@nestjs/common';
import { TransactionSavingsAccount } from '../transaction_saving_account/entities/transaction_saving_account.entity';

@Injectable()
@EventSubscriber()
export class TransactionSubscriber
  implements EntitySubscriberInterface<TransactionSavingsAccount>
{
  listenTo(): Function | string {
    return TransactionSavingsAccount;
  }

  async afterUpdate(
    event: UpdateEvent<TransactionSavingsAccount>,
  ): Promise<void> {
    const { entity } = event;
    //get transaction
    //get loan in processing and check it
    //if no ok return
    //else check balance >= 0 and loan.state === Incomplete
    //update loan.state to completed and save
    console.log('transaction subscriber updated', entity);
  }
}
