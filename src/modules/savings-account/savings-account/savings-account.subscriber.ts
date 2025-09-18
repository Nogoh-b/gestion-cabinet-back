// src/modules/savings-account/savings-account.subscriber.ts
import {
  EntitySubscriberInterface,
  InsertEvent,
  DataSource,
  EventSubscriber,
} from 'typeorm';
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { SavingsAccount } from './entities/savings-account.entity';
import { SavingsAccountService } from './savings-account.service';
import { TransactionSavingsAccountService } from 'src/modules/transaction/transaction_saving_account/transaction_saving_account.service';

@EventSubscriber()
@Injectable()
export class SavingsAccountSubscriber implements EntitySubscriberInterface<SavingsAccount> {
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
    return SavingsAccount;
  }

  async afterInsert(event: InsertEvent<SavingsAccount>) {
    console.log('afterInsert111 ', event.entity.id);
    
    
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