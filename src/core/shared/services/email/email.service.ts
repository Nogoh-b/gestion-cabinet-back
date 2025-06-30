// email.service.ts
import { MailerService } from '@nestjs-modules/mailer';
import { Injectable, Logger } from '@nestjs/common';




import { SendMailOptions } from '../../interfaces/send-mail.interface';





@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor(private readonly mailerService: MailerService) {}

  async sendMail(options: SendMailOptions): Promise<boolean> {
    try {
      /*await this.mailerService.sendMail({
        to: options.to,
        subject: options.subject,
        template: options.template,
        html :'<br>',
        context: options.context,
        attachments: options.attachments,
      });*/
      await this.mailerService.sendMail({
        to: options.to,
        subject: options.subject,
        attachments: options.attachments,
        html: options.message, 
      });
      this.logger.log(`Email sent to ${options.to}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email to ${options.to}`, error.stack);
      return false;
    }
  }

  async sendWelcomeEmail(to: string, username: string): Promise<boolean> {
    return this.sendMail({
      to,
      subject: 'Bienvenue sur notre plateforme !',
      message: '',
      context: { username },
    });
  }

  async sendPasswordResetEmail(to: string, resetLink: string): Promise<boolean> {
    return this.sendMail({
      to,
      subject: 'Réinitialisation de votre mot de passe',
      message: 'reset-password',
      context: { resetLink },
    });
  }
}