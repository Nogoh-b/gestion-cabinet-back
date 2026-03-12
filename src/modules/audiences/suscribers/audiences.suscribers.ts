import { DataSource, EntitySubscriberInterface, EventSubscriber, InsertEvent, UpdateEvent } from 'typeorm';
import { Audience } from '../entities/audience.entity';
import { EmployeeService } from 'src/modules/agencies/employee/employee.service';
import { CreateMailDto } from 'src/core/shared/emails/dto/create-mail.dto';
import { MailService } from 'src/core/shared/emails/emails.service';
import { AudiencesService } from '../audiences.service';

@EventSubscriber()
export class AudienceSubscriber implements EntitySubscriberInterface<Audience> {
  constructor(
    private dataSource: DataSource,
    private readonly employeeService: EmployeeService,
    private readonly audienceService: AudiencesService,
    private mailService: MailService, // OK maintenant
  ) {
    this.dataSource.subscribers.push(this); // ⭐ CRITIQUE
  }

  listenTo() {
    return Audience; // entité écoutée
  }

  async beforeInsert(event: InsertEvent<Audience>) {
    // console.log('BEFORE INSERT', event.entity);
    // logique beforeSave
  }

  async afterInsert(event: InsertEvent<Audience>) {
    console.log('AFTER INSERT ', event.entity.documents);
    await this.audienceService.sendEmails(event.entity.id, event.manager);
    return

    const users = await this.employeeService.findAllV1(undefined,undefined, ['user']);
    const a = event.entity;
    let mailDto = new CreateMailDto() 
    const deduplicationKey = `commande-${a.id}-confirmation-${a.status}`;
    mailDto.templateName = "entities/dossier/dossier-created-creator"
    mailDto.context = a
    mailDto.to = users.map(u => u.email)
    mailDto.subject = "Creation de l'audience Concernant le dossier " + a.dossier.dossier_number
    // this.mailService.create(mailDto, deduplicationKey)
    console.log({
      id: a.id,
      dossier_number: a.dossier.dossier_number,
      is_past: a.is_past,
      is_today: a.is_today,
      full_datetime: a.full_datetime,
    });
    // logique afterSave
  }

  async beforeUpdate(event: UpdateEvent<Audience>) {
    // console.log('BEFORE UPDATE', event.entity);
  }

  async afterUpdate(event: UpdateEvent<Audience>) {
    // console.log('AFTER UPDATE', event.entity);
  }
}