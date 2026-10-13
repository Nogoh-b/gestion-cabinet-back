import { Injectable, Logger } from '@nestjs/common';
import { MailService } from 'src/core/shared/emails/emails.service';
import type { AttachmentMail } from 'src/core/shared/emails/entities/mail.entity';

function escapeHtml(value: string): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface PlatformMailInput {
  to: string | string[];
  subject: string;
  title: string;
  /** Paragraphes (texte brut, échappé). */
  paragraphs: string[];
  /** Bloc mis en avant (code OTP, montant…). */
  highlight?: string;
  action?: { label: string; url: string };
  attachments?: AttachmentMail[];
  /** Ligne journalisée en développement si l'envoi échoue (jamais en prod). */
  devFallback?: string;
}

/**
 * Emails émis par la PLATEFORME (et non par un cabinet) : OTP super admin,
 * invitations, notifications d'abonnement. Toujours via le SMTP global.
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
        html: this.render(input),
        text: [input.title, ...input.paragraphs, input.highlight ?? '', input.action?.url ?? '']
          .filter(Boolean)
          .join('\n\n'),
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

  private render(input: PlatformMailInput): string {
    const brand = escapeHtml(process.env.PLATFORM_NAME || 'KabySoft');
    const paragraphs = input.paragraphs
      .map((p) => `<p style="margin:0 0 14px;line-height:1.55">${escapeHtml(p)}</p>`)
      .join('');
    const highlight = input.highlight
      ? `<div style="margin:18px 0;padding:14px 18px;border-radius:8px;background:#f1f5f9;font-size:24px;font-weight:700;letter-spacing:4px;text-align:center">${escapeHtml(input.highlight)}</div>`
      : '';
    const action = input.action
      ? `<p style="margin:22px 0"><a href="${escapeHtml(input.action.url)}" style="display:inline-block;padding:11px 20px;border-radius:8px;background:#0f172a;color:#ffffff;text-decoration:none;font-weight:600">${escapeHtml(input.action.label)}</a></p>
         <p style="margin:0 0 14px;font-size:12px;color:#64748b;word-break:break-all">${escapeHtml(input.action.url)}</p>`
      : '';
    return `<!doctype html><html><body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
      <div style="max-width:560px;margin:24px auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden">
        <div style="padding:16px 24px;background:#0f172a;color:#ffffff;font-weight:700">${brand}</div>
        <div style="padding:24px">
          <h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(input.title)}</h1>
          ${paragraphs}${highlight}${action}
        </div>
        <div style="padding:14px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b">Message automatique — merci de ne pas répondre.</div>
      </div></body></html>`;
  }
}
