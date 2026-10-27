import { Injectable } from '@nestjs/common';
import { DataSource, EntitySubscriberInterface, InsertEvent } from 'typeorm';
import { Employee } from '../agencies/employee/entities/employee.entity';
import { Cabinet } from '../cabinet/entities/cabinet.entity';
import { Conversation } from '../chat/entities/conversation.entity';

/** Keep the configured collective group populated, including onboarding-created employees. */
@Injectable()
export class ReferenceGroupSubscriber
  implements EntitySubscriberInterface<Employee>
{
  constructor(db: DataSource) {
    db.subscribers.push(this);
  }
  listenTo() {
    return Employee;
  }
  async afterInsert(event: InsertEvent<Employee>) {
    const employee = event.entity;
    if (!employee?.id || !employee.tenant_id) return;
    const cabinet = await event.manager.findOneBy(Cabinet, {
      id: employee.tenant_id,
    });
    if (!cabinet) return;
    const group = await event.manager.findOneBy(Conversation, {
      tenant_id: employee.tenant_id,
      isGroup: true,
      name: cabinet.default_chat_group_name,
    });
    if (group)
      await event.manager
        .createQueryBuilder()
        .relation(Conversation, 'participants')
        .of(group.id)
        .add(employee.id);
  }
}
