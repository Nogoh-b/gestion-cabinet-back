import { Module } from '@nestjs/common';
import { MailController } from './emails.controller';
import { MailService } from './emails.service';
import { Mail } from './entities/mail.entity';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [TypeOrmModule.forFeature([Mail, Dossier])],
  controllers: [MailController],
  providers: [MailService],
  exports: [MailService],
})
export class EmailsModule {}
