import {
  EntitySubscriberInterface,
  EventSubscriber,
  UpdateEvent,
} from 'typeorm';
import { Injectable } from '@nestjs/common';
import { TransactionSavingsAccount } from '../transaction_saving_account/entities/transaction_saving_account.entity';
import { Loan } from '../../credit/loan/entities/loan.entity';
import { CREDIT_STATE } from '../../../utils/types';
import { SavingsAccount } from '../../savings-account/savings-account/entities/savings-account.entity';

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
    const { entity, manager } = event;
    //get transaction
    const transaction = entity as TransactionSavingsAccount;
    const savingAccount = await manager
      .getRepository(SavingsAccount)
      .findOneBy({
        id: transaction.targetSavingsAccount?.id as number,
      });
    if (!savingAccount) return;
    else if (savingAccount.avalaible_balance >= 0) {
      //get loan in processing and check it
      const loan = await manager
        .getRepository(Loan)
        .findOneBy({ state: CREDIT_STATE.INCOMPLETE });
      if (!loan) return;
      await manager
        .getRepository(Loan)
        .update(loan.id, { state: CREDIT_STATE.COMPLETED });
      console.log('loan updated to completed');
    }

    console.log('transaction subscriber updated');
  }
}
