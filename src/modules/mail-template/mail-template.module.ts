import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailTemplate } from './entities/mail-template.entity';
import { MailTemplateService } from './mail-template.service';
import { MailTemplateController } from './mail-template.controller';
import { TemplateContextService } from './template-context.service';
import { Cabinet } from 'src/modules/cabinet/entities/cabinet.entity';
import { AiDatabaseModule } from 'src/core/ai-database/ai-database.module';

@Module({
  // AiDatabaseModule : droits de lecture des listes du contexte des modèles.
  imports: [TypeOrmModule.forFeature([MailTemplate, Cabinet]), AiDatabaseModule],
  controllers: [MailTemplateController],
  providers: [MailTemplateService, TemplateContextService],
  exports: [MailTemplateService, TemplateContextService],
})
export class MailTemplateModule {}
