import { Module } from '@nestjs/common';
import { MailController } from './emails.controller';
import { MailService } from './emails.service';
import { Mail } from './entities/mail.entity';
import { TypeOrmModule } from '@nestjs/typeorm';

@Module({
  imports: [TypeOrmModule.forFeature([Mail])],
  controllers: [MailController],
  providers: [MailService],
  exports: [MailService],
})
export class EmailsModule {}
