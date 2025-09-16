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
import { TransactionSavingsAccount } from './entities/transaction_saving_account.entity';
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
    console.log('afterInsert111 ', event.entity.id);
    
      this.transactionSavingsAccountService.repeatEvery(5, 3, async () => {
        console.log('Tâche exécutée à', new Date().toISOString());
        const tx = await this.transactionSavingsAccountService.findOne(event.entity.id);
        console.log('Found via service:', tx);
      });
      setImmediate(async () => {
        try {
        } catch (e) {
          console.error('Erreur service après insert:', e);
        }
      });


    

    try {
      // Utilisation du service injecté

      /*if (event.entity.created_online && !event.entity.code_cash) {
        const sa = await this.savingsAccountService.updateCodeCash(event.entity.id);
        
        if (sa?.code_cash) {
          await event.manager.update(
            SavingsAccount,
            event.entity.id,
            { code_cash: sa.code_cash }
          );
        }
      }*/
    } catch (error) {
      console.error('Error in afterInsert:', error);
    }
  }
}