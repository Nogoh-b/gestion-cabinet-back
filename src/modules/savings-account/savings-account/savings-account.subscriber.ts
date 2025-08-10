// src/modules/savings-account/savings-account.subscriber.ts
import { EventSubscriber, InsertEvent, EntitySubscriberInterface } from 'typeorm';


import { SavingsAccount } from './entities/savings-account.entity';
import { SavingsAccountService } from './savings-account.service';



@EventSubscriber()
export class SavingsAccountSubscriber implements EntitySubscriberInterface<SavingsAccount> {
  constructor(private readonly savingsAccountService: SavingsAccountService) {}

  listenTo() {
    return SavingsAccount;
  }

  async afterInsert(event: InsertEvent<SavingsAccount>) {
    console.log('afterInsert', event.entity.id, event.entity);
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
  }
}