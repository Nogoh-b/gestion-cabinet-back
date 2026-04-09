// shared/shared-services.module.ts
import { Global, Module } from '@nestjs/common';
import { PaginationService } from './shared/services/pagination/pagination.service';
import { KeyGeneratorService } from './shared/services/key-generator/key-generator.service';
import { SocketService } from './shared/services/socket/socket.service';
import { MainGateway } from './shared/services/socket/main.gateway';
import { EmailsModule } from './shared/emails/emails.module';
import { McotiService } from './shared/services/mCoti/mcoti.service';
import { OtpService } from './shared/services/otp/otp.service';
import { EmailService } from './shared/services/email/email.service copy';
import { MailService } from './shared/emails/emails.service';
import { PaginationServiceV1 } from './shared/services/pagination/paginations-v1.service';

@Global()
@Module({
  imports: [EmailsModule],
  providers: [
    PaginationService,
    PaginationServiceV1,
    KeyGeneratorService,
    SocketService,
    MainGateway,
    MailService,
    McotiService,
    OtpService,
  ],
  exports: [
    PaginationService,
    PaginationServiceV1,
    KeyGeneratorService,
    SocketService,
    MainGateway,
    EmailService,
    EmailsModule,
    McotiService,
    OtpService,
  ],
})
export class SharedServicesModule {}