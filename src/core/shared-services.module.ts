// shared/shared-services.module.ts
import { Global, Module } from '@nestjs/common';

import { EmailsModule } from './shared/emails/emails.module';
import { MailService } from './shared/emails/emails.service';
import { EmailService } from './shared/services/email/email.service copy';
import { KeyGeneratorService } from './shared/services/key-generator/key-generator.service';
import { OtpService } from './shared/services/otp/otp.service';
import { PaginationService } from './shared/services/pagination/pagination.service';
import { PaginationServiceV1 } from './shared/services/pagination/paginations-v1.service';
import { MainGateway } from './shared/services/socket/main.gateway';
import { SocketService } from './shared/services/socket/socket.service';


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
    OtpService,
  ],
})
export class SharedServicesModule {}