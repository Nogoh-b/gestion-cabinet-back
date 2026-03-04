import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThanOrEqual } from 'typeorm';
import { MailerService } from '@nestjs-modules/mailer';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Mail, MailStatus } from 'src/core/shared/emails/entities/mail.entity';
import { CreateMailDto } from './dto/create-mail.dto';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    @InjectRepository(Mail)
    private mailRepository: Repository<Mail>,
    private mailerService: MailerService,
  ) {}

  /**
   * Crée un email en base (programmé ou immédiat)
   */
  async create(createMailDto: CreateMailDto): Promise<Mail> {
  const enrichedContext = {
    ...createMailDto.context,
    logoUrl: process.env.COMPANY_LOGO_URL,
    companyName: process.env.COMPANY_NAME,
    companyAddress: process.env.COMPANY_ADDRESS,
    companyEmail: process.env.COMPANY_EMAIL,
    companyPhone: process.env.COMPANY_PHONE,
    currentYear: new Date().getFullYear().toString(),
  };
    const mail = this.mailRepository.create({
      ...createMailDto,
      // context: enrichedContext,
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
   * Récupère un mail par ID
   */
  async findOne(id: string): Promise<Mail | null> {
    return this.mailRepository.findOne({ where: { id } });
  }
}