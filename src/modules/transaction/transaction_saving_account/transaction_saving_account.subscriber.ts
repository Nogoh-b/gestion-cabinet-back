// src/modules/savings-account/savings-account.subscriber.ts
import {
  EntitySubscriberInterface,
  InsertEvent,
  DataSource,
  EventSubscriber,
  UpdateEvent,
} from 'typeorm';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { TransactionSavingsAccountService } from 'src/modules/transaction/transaction_saving_account/transaction_saving_account.service';
import { TransactionProvider, TransactionSavingsAccount } from './entities/transaction_saving_account.entity';
import { SavingsAccountService } from 'src/modules/savings-account/savings-account/savings-account.service';
import { SavingsAccount } from 'src/modules/savings-account/savings-account/entities/savings-account.entity';
import { Loan } from 'src/modules/credit/loan/entities/loan.entity';
import { CREDIT_STATE } from 'src/utils/types';

@EventSubscriber()
@Injectable()
export class TransactionSavingsAccountSubscriber implements EntitySubscriberInterface<TransactionSavingsAccount> {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly savingsAccountService: SavingsAccountService,
    private readonly transactionSavingsAccountService: TransactionSavingsAccountService,
  ) {
    // Enregistrement manuel du subscriber
    this.dataSource.subscribers.push(this);
  }

  listenTo() {
    return TransactionSavingsAccount;
  }

  async afterInsert(event: InsertEvent<TransactionSavingsAccount>) {
      const tx = event.entity
        console.log('afterInsert111 ', tx.provider_code === TransactionProvider.OM);
        if((tx.provider_code === TransactionProvider.MOMO || tx.provider_code === TransactionProvider.OM) && !tx.has_issue ){
          this.transactionSavingsAccountService.repeatEvery(15, 3, async () => {
                console.log('Tâche exécutée à', event.entity.channelTransaction.code , ' ', event.entity.originSavingsAccount ,  ' ',event.entity.targetSavingsAccount);
                try {
                  const tx1 = await this.transactionSavingsAccountService.checkWthDraw(event.entity.reference);
                  console.log('Found via service:', tx1);  
                } catch (error) {
                  
                }
          });
        }
      /*setImmediate(async () => {
        try {
        } catch (e) {
          console.error('Erreur service après insert:', e);
        }
      });*/


    

  }

  async afterUpdate(
    event: UpdateEvent<TransactionSavingsAccount>,
  ): Promise<void> {
    console.log('transaction subscriber updated 11 ');
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