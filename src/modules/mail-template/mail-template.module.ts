import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { MailTemplate } from './entities/mail-template.entity';
import { MailTemplateService } from './mail-template.service';
import { MailTemplateController } from './mail-template.controller';
import { Cabinet } from 'src/modules/cabinet/entities/cabinet.entity';

@Module({
  imports: [TypeOrmModule.forFeature([MailTemplate, Cabinet])],
  controllers: [MailTemplateController],
  providers: [MailTemplateService],
  exports: [MailTemplateService],
})
export class MailTemplateModule {}
