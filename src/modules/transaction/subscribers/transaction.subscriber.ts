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
    console.log('transaction subscriber updated', entity);
  }
}
