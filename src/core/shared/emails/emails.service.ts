import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { MailerService } from '@nestjs-modules/mailer';
import { Cron, CronExpression } from '@nestjs/schedule';
import { AttachmentMail, Mail, MailStatus } from 'src/core/shared/emails/entities/mail.entity';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { CreateMailDto } from './dto/create-mail.dto';
import { helpers } from 'src/utils/helper-template-maill';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    @InjectRepository(Mail)
    private mailRepository: Repository<Mail>,
    @InjectRepository(Dossier)
    private dossierRepository: Repository<Dossier>,
    private mailerService: MailerService,
  ) {}

  /**
   * Crée un email en base (programmé ou immédiat)
   */
  async create(createMailDto: CreateMailDto, deduplicationKey?: string): Promise<Mail> {
    if (deduplicationKey) {
      const existingMail = await this.mailRepository.findOne({
        where: { deduplicationKey }
      });
      
      if (existingMail) {
        this.logger.warn(`Email déjà créé avec la clé ${deduplicationKey}`);
        return existingMail;
      }
    }
    const mail = this.mailRepository.create({
      ...createMailDto,
      deduplicationKey, // Stocker la clé
    scheduledAt: createMailDto.scheduledAt ? new Date(createMailDto.scheduledAt) : undefined,
      status: MailStatus.PENDING,
    });
    const saved = await this.mailRepository.save(mail);

    // Si pas de programmation, on tente l'envoi immédiat (asynchrone)
    if (!saved.scheduledAt) {
      // On lance l'envoi sans attendre (fire-and-forget)
      this.sendMail(saved.id).catch(err => this.logger.error(`Erreur envoi immédiat mail ${saved.id}`, err));
    }

    return saved;
  }

  /**
   * Envoie un email par son ID (appelé par le worker ou manuellement)
   */
  async sendMail(id: string): Promise<void> {
    const mail = await this.mailRepository.findOne({ where: { id } });
    if (!mail) {
      throw new Error(`Mail #${id} not found`);
    }

    // Éviter les envois multiples
    if (mail.status === MailStatus.SENT) {
      this.logger.warn(`Mail ${id} déjà envoyé`);
      return;
    }
    let attachments : AttachmentMail[] = []
    if(mail.attachments)
      attachments = await this.prepareAttachmentsWithBuffers(mail.attachments);

    try {
      // Préparer les options d'envoi
      const mailOptions: any = {
        to: mail.to,
        cc: mail.cc,
        bcc: mail.bcc,
        subject: mail.subject,
        attachments: mail.attachments,
      };

      // Si template, l'utiliser
      if (mail.templateName) {
        mailOptions.template = mail.templateName;
        mailOptions.context = mail.context || {};
      } else {
        // Sinon utiliser le html/text fourni
        mailOptions.html = mail.html;
        mailOptions.text = mail.text;
        mailOptions.layout = 'layout'; // ou passer dans context
      }

      // Envoyer
      await this.mailerService.sendMail(mailOptions);

      // Mettre à jour le statut
      mail.status = MailStatus.SENT;
      mail.sentAt = new Date();
      await this.mailRepository.save(mail);

      this.logger.log(`Email ${id} envoyé avec succès`);
    } catch (error) {
      this.logger.error(`Échec envoi email ${id}`, error);

      mail.status = MailStatus.FAILED;
      mail.failedAt = new Date();
      mail.errorMessage = error.message;
      mail.retryCount += 1;
      await this.mailRepository.save(mail);

      throw error; // pour permettre au caller de gérer
    }
  }


  private async prepareAttachmentsWithBuffers(documents: AttachmentMail[]): Promise<any[]> {
  const attachments = [] as AttachmentMail[];
  for (const doc of documents) {
    if (doc.href) {
      const response = await fetch(doc.href);
      const buffer = await response.arrayBuffer();
      attachments.push({
        filename: doc.filename,
        content: Buffer.from(buffer),
        contentType: doc.contentType,
      });
    }
    // sinon, lire depuis le disque local
  }
  return attachments;
}

 /**
   * Envoie un email immédiatement sans le persister en base
   */
  async sendDirect(options: {
    to: string | string[];
    subject?: string;
    html?: string;
    text?: string;
    templateName?: string;
    context?: any;
    attachments?: AttachmentMail[];
    cc?: string | string[];
    bcc?: string | string[];
  }): Promise<void> {
    const { to, subject, html, text, templateName, context, attachments, cc, bcc } = options;

    // Préparer les pièces jointes si nécessaire (récupération des buffers)
    let attachmentList: any[] = [];
    if (attachments && attachments.length > 0) {
      attachmentList = await this.prepareAttachmentsWithBuffers(attachments);
    }

    // Construire les options d'envoi
    const mailOptions: any = {
      to,
      cc,
      bcc,
      subject,
      attachments: attachmentList,
    };

    if (templateName) {
      mailOptions.template = templateName;
      mailOptions.context = context || {};
    } else {
      mailOptions.html = html;
      mailOptions.text = text;
    }

    // Envoyer
    await this.mailerService.sendMail(mailOptions);
    this.logger.log(`Email direct envoyé à ${to}`);
  }



  async sendResetPasswordEmail(user: any, token: string) {
  const context = {
    ...user,
    resetLink: helpers.resetPasswordLink(token)
  };
  
  await this.sendDirect({
    to: user.email,
    subject: 'Réinitialisation de votre mot de passe',
    templateName: 'entities/employee/reset-password',
    context
  });
}

async sendActivationEmail(user: any, token: string) {
  const context = {
    ...user,
    activationLink: helpers.activationLink(token)
  };
  
  await this.sendDirect({
    to: user.email,
    subject: 'Activez votre compte',
    templateName: 'entities/employee/welcome-activation',
    context
  });
}

async sendWelcomeWithPasswordEmail(user: any, tempPassword: string) {
  const context = {
    ...user,
    tempPassword
  };
  
  await this.sendDirect({
    to: user.email,
    subject: 'Bienvenue sur la plateforme',
    templateName: 'entities/employee/welcome-password',
    context
  });
}

  /**
   * Annule un email programmé
   */
  async cancel(id: string): Promise<Mail> {
    const mail = await this.mailRepository.findOne({ where: { id } });
    if (!mail) throw new Error('Mail not found');
    if (mail.status !== MailStatus.PENDING) {
      throw new Error('Seuls les mails en attente peuvent être annulés');
    }
    mail.status = MailStatus.CANCELLED;
    return this.mailRepository.save(mail);
  }

  /**
   * Cron pour envoyer les emails programmés (toutes les minutes)
   */
  @Cron(CronExpression.EVERY_12_HOURS)
  async handleScheduledMails() {
    this.logger.debug('Recherche des emails programmés à envoyer...');

    const now = new Date();
    const pendingMails = await this.mailRepository.find({
      where: {
        status: MailStatus.PENDING,
        scheduledAt: LessThanOrEqual(now),
      },
    });

    for (const mail of pendingMails) {
      // On lance l'envoi en arrière-plan pour ne pas bloquer le cron
      this.sendMail(mail.id).catch(err =>
        this.logger.error(`Erreur cron pour mail ${mail.id}`, err),
      );
    }
  }

  /**
   * Récupère tous les mails (pour le contrôleur)
   */
  async findAll(): Promise<Mail[]> {
    return this.mailRepository.find({ order: { createdAt: 'DESC' } });
  }

  /**
   * Liste les mails liés à une entité métier via `metadata.linkedEntity.{type,id}`.
   * Convention de stockage : `metadata = { linkedEntity: { type: 'dossier', id: 42 } }`.
   * Utilise une requête JSON (compatible MySQL 5.7+).
   */
  async findByEntity(entityType: string, entityId: string | number): Promise<Mail[]> {
    return this.mailRepository
      .createQueryBuilder('mail')
      .where(`JSON_EXTRACT(mail.metadata, '$.linkedEntity.type') = :type`, { type: entityType })
      .andWhere(
        `(JSON_EXTRACT(mail.metadata, '$.linkedEntity.id') = :id ` +
        ` OR JSON_EXTRACT(mail.metadata, '$.linkedEntity.id') = :idStr)`,
        { id: Number(entityId) || -1, idStr: String(entityId) },
      )
      .orderBy('mail.createdAt', 'DESC')
      .getMany();
  }

  /**
   * Liste tous les mails liés à un client :
   *   - soit directement (`linkedEntity.type = 'client'` + id du client)
   *   - soit via un dossier dont le `client_id` correspond au client
   *
   * On utilise `JSON_UNQUOTE` partout pour garantir une comparaison en string,
   * peu importe si l'id est stocké comme int ou string dans la metadata JSON.
   */
  async findByClient(clientId: string | number): Promise<Mail[]> {
    const idNum = Number(clientId);
    const idStr = String(clientId);

    // 1. Récupère les ids de dossiers appartenant à ce client via raw SQL
    // (contourne tout mapping TypeORM / problème de colonne)
    const rawRows: Array<{ id: number }> = await this.dossierRepository.query(
      'SELECT id FROM dossiers WHERE client_id = ? AND deleted_at IS NULL',
      [idNum],
    );
    const dossierIds = rawRows.map(r => String(r.id));

    this.logger.debug(
      `[findByClient] clientId=${idStr} → ${rawRows.length} dossier(s) : [${dossierIds.join(', ')}]`,
    );

    // Diagnostic : si toujours 0, loguer quels client_ids ont des dossiers avec des mails
    if (rawRows.length === 0) {
      const sample: Array<{ client_id: number; cnt: string }> = await this.dossierRepository.query(
        `SELECT d.client_id, COUNT(d.id) as cnt
         FROM dossiers d
         WHERE d.deleted_at IS NULL
           AND EXISTS (
             SELECT 1 FROM mails m
             WHERE JSON_UNQUOTE(JSON_EXTRACT(m.metadata, '$.linkedEntity.type')) = 'dossier'
               AND JSON_UNQUOTE(JSON_EXTRACT(m.metadata, '$.linkedEntity.id')) = CAST(d.id AS CHAR)
           )
         GROUP BY d.client_id
         ORDER BY cnt DESC
         LIMIT 20`,
      );
      this.logger.debug(
        `[findByClient] DEBUG — clients ayant des dossiers avec mails : ` +
        sample.map(r => `client_id=${r.client_id}(${r.cnt} dossiers)`).join(', '),
      );
    }

    const qb = this.mailRepository
      .createQueryBuilder('mail')
      .where(
        // Mail directement lié au client
        `(JSON_UNQUOTE(JSON_EXTRACT(mail.metadata, '$.linkedEntity.type')) = 'client'
          AND JSON_UNQUOTE(JSON_EXTRACT(mail.metadata, '$.linkedEntity.id')) = :idStr)`,
        { idStr },
      );

    if (dossierIds.length > 0) {
      qb.orWhere(
        // Mail lié à l'un des dossiers du client
        `(JSON_UNQUOTE(JSON_EXTRACT(mail.metadata, '$.linkedEntity.type')) = 'dossier'
          AND JSON_UNQUOTE(JSON_EXTRACT(mail.metadata, '$.linkedEntity.id')) IN (:...dossierIds))`,
        { dossierIds },
      );
    }

    const results = await qb.orderBy('mail.createdAt', 'DESC').getMany();
    this.logger.debug(`[findByClient] ${results.length} mail(s) trouvé(s)`);
    return results;
  }

  /**
   * Récupère un mail par ID
   */
  async findOne(id: string): Promise<Mail | null> {
    return this.mailRepository.findOne({ where: { id } });
  }
}