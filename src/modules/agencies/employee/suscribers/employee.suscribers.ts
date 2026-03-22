


import { DataSource, EntitySubscriberInterface, EventSubscriber, InsertEvent, UpdateEvent } from 'typeorm';
import { EmployeeService } from 'src/modules/agencies/employee/employee.service';
import { Employee } from '../entities/employee.entity';

@EventSubscriber()
export class EmployeeSubscriber implements EntitySubscriberInterface<Employee> {
  constructor(
    private dataSource: DataSource,
    private readonly employeeService: EmployeeService,
  ) {
    this.dataSource.subscribers.push(this); // ⭐ CRITIQUE
  }

  listenTo() {
    return Employee; // entité écoutée
  }

  async beforeInsert(event: InsertEvent<Employee>) {
    // console.log('BEFORE INSERT', event.entity);
    // logique beforeSave
  }

  async afterInsert(event: InsertEvent<Employee>) {
    console.log('AFTER INSERT Employee ', event.entity);
    // await this.employeeService.sendEmails(event.entity.id, event.manager);
    return

  }

  async beforeUpdate(event: UpdateEvent<Employee>) {
    // console.log('BEFORE UPDATE', event.entity);
  }

  async afterUpdate(event: UpdateEvent<Employee>) {
    // console.log('AFTER UPDATE', event.entity);
  }
}