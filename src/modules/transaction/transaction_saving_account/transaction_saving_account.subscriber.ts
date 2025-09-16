// src/modules/savings-account/savings-account.subscriber.ts
import {
  EntitySubscriberInterface,
  InsertEvent,
  DataSource,
  EventSubscriber,
} from 'typeorm';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { TransactionSavingsAccountService } from 'src/modules/transaction/transaction_saving_account/transaction_saving_account.service';
import { TransactionProvider, TransactionSavingsAccount } from './entities/transaction_saving_account.entity';
import { SavingsAccountService } from 'src/modules/savings-account/savings-account/savings-account.service';

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

}