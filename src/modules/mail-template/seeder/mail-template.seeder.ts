import { findOneForTenant } from 'src/core/tenant/seeder-helper';
import { DataSource } from 'typeorm';
import { Seeder, SeederFactoryManager } from 'typeorm-extension';

import { AUTH_TEMPLATE_DEFAULTS } from '../auth-template.defaults';
import { MailTemplate } from '../entities/mail-template.entity';
import { buildNotificationTemplates } from '../notification-template.defaults';

export default class MailTemplateSeeder implements Seeder {
  public async run(
    dataSource: DataSource,
    _factoryManager: SeederFactoryManager,
  ): Promise<any> {
    const repository = dataSource.getRepository(MailTemplate);
    const templates: Partial<MailTemplate>[] = [
      ...AUTH_TEMPLATE_DEFAULTS,
      ...buildNotificationTemplates(),
    ];

    for (const data of templates) {
      const existing = await findOneForTenant(repository, 'code', data.code);

      if (!existing) {
        await repository.save(repository.create(data));
        console.log(`Template mail cree : ${data.code}`);
        continue;
      }

      Object.assign(existing, {
        name: data.name,
        category: data.category,
        audience: data.audience,
        description: data.description,
        subject: data.subject,
        body_html: data.body_html,
        variables: data.variables,
        is_system: data.is_system,
        is_active: data.is_active,
      });

      await repository.save(existing);
      console.log(`Template mail mis a jour : ${data.code}`);
    }
  }
}
