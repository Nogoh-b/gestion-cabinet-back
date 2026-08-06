import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as nodemailer from 'nodemailer';
import { Cabinet } from 'src/modules/cabinet/entities/cabinet.entity';
import { decryptSmtpConfig } from './smtp-config.crypto';

export interface SmtpConfig {
  host?: string;
  port?: number;
  secure?: boolean;
  user?: string;
  pass?: string;
  from?: string;
}

/**
 * Construit un transport SMTP à partir de la configuration stockée par cabinet
 * (`cabinets.smtp_config`). Permet à chaque cabinet d'utiliser son propre
 * serveur d'envoi ; à défaut, MailService retombe sur le SMTP par défaut.
 */
@Injectable()
export class SmtpService {
  private readonly logger = new Logger(SmtpService.name);

  constructor(
    @InjectRepository(Cabinet)
    private readonly cabinetRepo: Repository<Cabinet>,
  ) {}

  buildTransport(cfg: SmtpConfig | null | undefined): nodemailer.Transporter | null {
    if (!cfg?.host || !cfg?.port) return null;
    return nodemailer.createTransport({
      host: cfg.host,
      port: Number(cfg.port),
      secure: !!cfg.secure,
      auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
    });
  }

  /** Transport + expéditeur du cabinet, ou null si non configuré. */
  async getTenantTransport(
    cabinetId: number,
  ): Promise<{ transport: nodemailer.Transporter; from?: string } | null> {
    if (!cabinetId) return null;
    const cabinet = await this.cabinetRepo
      .createQueryBuilder('cabinet')
      .addSelect('cabinet.smtp_config_encrypted')
      .where('cabinet.id = :cabinetId', { cabinetId })
      .getOne();
    const cfg = cabinet?.smtp_config_encrypted
      ? decryptSmtpConfig<SmtpConfig & Record<string, unknown>>(
          cabinet.smtp_config_encrypted,
        )
      : (cabinet?.smtp_config ?? null) as SmtpConfig | null;
    const transport = this.buildTransport(cfg);
    if (!transport) return null;
    return { transport, from: cfg?.from ?? cfg?.user };
  }

  /** Envoie un e-mail de test avec la configuration SMTP du cabinet. */
  async sendTest(cabinetId: number, to: string): Promise<{ success: boolean; message: string }> {
    const t = await this.getTenantTransport(cabinetId);
    if (!t) {
      throw new BadRequestException('Configuration SMTP absente ou incomplète (host/port requis).');
    }
    try {
      await t.transport.sendMail({
        from: t.from,
        to,
        subject: 'Test SMTP — configuration validée',
        text: 'Votre configuration SMTP fonctionne correctement.',
        html: '<p>✅ Votre configuration SMTP fonctionne correctement.</p>',
      });
      return { success: true, message: `E-mail de test envoyé à ${to}` };
    } catch (e: any) {
      this.logger.warn(`[SMTP test] échec: ${e?.message ?? e}`);
      throw new BadRequestException(`Échec de l'envoi de test : ${e?.message ?? e}`);
    }
  }
}
