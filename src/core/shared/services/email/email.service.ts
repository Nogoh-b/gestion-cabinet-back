// email.service.ts
import * as fs from 'fs';
import * as path from 'path';

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

    async sendMail1({ to, subject, templatePath, context }: {
    to: string;
    subject: string;
    templatePath: string;
    context: Record<string, any>;
  }) {
    const template = fs.readFileSync(path.join(__dirname, 'templates', templatePath), 'utf-8');
    const message = this.renderTemplate(template, context);

    // Appel à un service de mail ici (ex: nodemailer, MailerService...)
    console.log(`✉️ Envoi à ${to}\n${message}`);
    return { to, subject, message };
  }

  private renderTemplate(template: string, context: Record<string, any>): string {
    return template.replace(/{{\s*(\w+)\s*}}/g, (_, key) => context[key] ?? '');
  }
}