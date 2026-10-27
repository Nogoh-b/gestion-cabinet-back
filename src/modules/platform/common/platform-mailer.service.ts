import { Injectable, Logger } from '@nestjs/common';
import { MailService } from 'src/core/shared/emails/emails.service';
import type { AttachmentMail } from 'src/core/shared/emails/entities/mail.entity';
import {
  renderSimpleMail,
  renderSimpleText,
  SimpleMailInput,
} from 'src/core/shared/emails/simple-mail-template';

export interface PlatformMailInput extends SimpleMailInput {
  to: string | string[];
  subject: string;
  attachments?: AttachmentMail[];
  /** Ligne journalisée en développement si l'envoi échoue (jamais en prod). */
  devFallback?: string;
}

/**
 * Emails émis par la PLATEFORME (et non par un cabinet) : OTP super admin,
 * invitations, messages aux cabinets. Toujours via le SMTP global.
 */
@Injectable()
export class PlatformMailerService {
  private readonly logger = new Logger(PlatformMailerService.name);

  constructor(private readonly mail: MailService) {}

  /** Envoie l'email ; retourne false (sans lever) en cas d'échec. */
  async send(input: PlatformMailInput): Promise<boolean> {
    try {
      await this.mail.sendDirect({
        to: input.to,
        subject: input.subject,
        html: renderSimpleMail(input),
        text: renderSimpleText(input),
        attachments: input.attachments,
        transport: 'platform',
      });
      return true;
    } catch (error) {
      this.logger.warn(
        `Email plateforme non envoyé (${input.subject}) : ${(error as Error).message}`,
      );
      if (process.env.NODE_ENV !== 'production' && input.devFallback) {
        this.logger.warn(`[DEV] ${input.devFallback}`);
      }
      return false;
    }
  }
}
