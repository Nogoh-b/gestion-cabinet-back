import { Module } from '@nestjs/common';
import { MailController } from './emails.controller';
import { MailService } from './emails.service';
import { SmtpService } from './smtp.service';
import { Mail } from './entities/mail.entity';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { Cabinet } from 'src/modules/cabinet/entities/cabinet.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [TypeOrmModule.forFeature([Mail, Dossier, Cabinet])],
  controllers: [MailController],
  providers: [MailService, SmtpService],
  exports: [MailService, SmtpService],
})
export class EmailsModule {}
