import * as fs from 'fs';
import * as path from 'path';
import { join } from 'path';
import { UPLOAD_DOCS_PATH } from 'src/core/common/constants/constants';
import { FilesUtil } from 'src/core/shared/utils/file.util';
import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import { Cabinet } from 'src/modules/cabinet/entities/cabinet.entity';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { DocumentCategory } from 'src/modules/document-category/entities/document-category.entity';
import { DocumentCustomerService } from 'src/modules/documents/document-customer/document-customer.service';
import {
  DocumentCustomer,
  DocumentCustomerStatus,
} from 'src/modules/documents/document-customer/entities/document-customer.entity';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { StatutFacture } from 'src/modules/facture/dto/create-facture.dto';
import { inlineContentDisposition } from 'src/core/shared/utils/content-disposition.util';
import { Facture } from 'src/modules/facture/entities/facture.entity';
import { User } from 'src/modules/iam/user/entities/user.entity';
import {
  ModePaiement,
  StatutPaiement,
} from 'src/modules/paiement/dto/create-paiement.dto';
import { Paiement } from 'src/modules/paiement/entities/paiement.entity';
import { In, IsNull, Repository } from 'typeorm';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';

import { ClientMessage } from './entities/client-message.entity';

/** Taille max d'un document déposé par le client (octets). */
export const CLIENT_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024;
/** Taille max d'une preuve de paiement (octets). */
export const CLIENT_PROOF_MAX_BYTES = 5 * 1024 * 1024;

const DOCUMENT_MIMETYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'text/plain',
]);
const PROOF_MIMETYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

/** Modes de paiement proposés au client (déclaration manuelle). */
const CLIENT_PAYMENT_MODES: Record<string, ModePaiement> = {
  virement: ModePaiement.VIREMENT,
  mobile: ModePaiement.Mobile,
  cheque: ModePaiement.CHEQUE,
  especes: ModePaiement.ESPECES,
  autre: ModePaiement.AUTRE,
};

const MODE_LABELS: Record<number, string> = {
  [ModePaiement.VIREMENT]: 'Virement',
  [ModePaiement.CHEQUE]: 'Chèque',
  [ModePaiement.ESPECES]: 'Espèces',
  [ModePaiement.CARTE]: 'Carte',
  [ModePaiement.PRELEVEMENT]: 'Prélèvement',
  [ModePaiement.Mobile]: 'Mobile money',
  [ModePaiement.AUTRE]: 'Autre',
};

/** Factures visibles du client : émises, hors brouillon, annulées et avoirs. */
const VISIBLE_FACTURE_STATUSES = [
  StatutFacture.ENVOYEE,
  StatutFacture.PARTIELLEMENT_PAYEE,
  StatutFacture.PAYEE,
  StatutFacture.IMPAYEE,
];
const PAYABLE_FACTURE_STATUSES = [
  StatutFacture.ENVOYEE,
  StatutFacture.PARTIELLEMENT_PAYEE,
  StatutFacture.IMPAYEE,
];

/**
 * Colonnes ENUM('0','1',…) : MySQL compare un NOMBRE à l'INDEX du libellé
 * (status = 2 vise le libellé '1'), ce qui ferait fuir les brouillons. Les
 * filtres de statut passent donc toujours par des chaînes.
 */
const statusIn = (values: number[]): any => In(values.map(String));
const statusIs = (value: number): any => String(value);

/**
 * Portail client : toutes les lectures et écritures sont bornées à la fiche
 * client du compte connecté (`customerId` du JWT). Aucune méthode n'accepte
 * un identifiant de client en entrée.
 */
@Injectable()
export class ClientPortalService {
  constructor(
    @InjectRepository(Dossier)
    private readonly dossierRepo: Repository<Dossier>,
    @InjectRepository(DocumentCustomer)
    private readonly docRepo: Repository<DocumentCustomer>,
    @InjectRepository(DocumentCategory)
    private readonly categoryRepo: Repository<DocumentCategory>,
    @InjectRepository(Facture)
    private readonly factureRepo: Repository<Facture>,
    @InjectRepository(Paiement)
    private readonly paiementRepo: Repository<Paiement>,
    @InjectRepository(Customer)
    private readonly customerRepo: Repository<Customer>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @InjectRepository(ClientMessage)
    private readonly messageRepo: Repository<ClientMessage>,
    @InjectRepository(Cabinet)
    private readonly cabinetRepo: Repository<Cabinet>,
    private readonly documentService: DocumentCustomerService,
  ) {}

  // ── Garde-fous ────────────────────────────────────────────────────────────

  private customerIdOf(user: any): number {
    const id = Number(user?.customerId);
    if (!id) throw new ForbiddenException('Compte client sans fiche client.');
    return id;
  }

  /** Dossier du client connecté, sinon 404 (on ne révèle pas son existence). */
  private async ownDossier(customerId: number, dossierId: number) {
    const dossier = await this.dossierRepo.findOne({
      where: { id: dossierId, client_id: customerId },
    });
    if (!dossier) throw new NotFoundException('Dossier introuvable');
    return dossier;
  }

  private async ownFacture(customerId: number, factureId: string) {
    const facture = await this.factureRepo.findOne({
      where: {
        id: String(factureId),
        client_id: customerId,
        status: statusIn(VISIBLE_FACTURE_STATUSES),
        original_facture_id: IsNull(),
      },
      relations: ['paiements', 'dossier'],
    });
    if (!facture) throw new NotFoundException('Facture introuvable');
    return facture;
  }

  // ── Synthèse ──────────────────────────────────────────────────────────────

  async summary(user: any) {
    const customerId = this.customerIdOf(user);

    const [dossiers, factures, pendingDocs, unreadMessages] = await Promise.all(
      [
        this.dossierRepo.count({ where: { client_id: customerId } }),
        this.factureRepo.find({
          where: {
            client_id: customerId,
            status: statusIn(PAYABLE_FACTURE_STATUSES),
            original_facture_id: IsNull(),
          },
          relations: ['paiements'],
        }),
        this.docRepo.count({
          where: {
            customer_id: customerId,
            status: statusIs(DocumentCustomerStatus.PENDING),
          },
        }),
        this.messageRepo.count({
          where: {
            customer_id: customerId,
            sender_type: 'cabinet',
            read_by_client_at: IsNull(),
          },
        }),
      ],
    );

    let amountDue = 0;
    let pendingPayments = 0;
    for (const f of factures) {
      const { remaining, pending } = this.amounts(f);
      amountDue += Math.max(0, remaining);
      if (pending > 0) pendingPayments += 1;
    }

    const cabinet = await this.cabinet();

    return {
      dossiers_count: dossiers,
      unpaid_factures_count: factures.filter(
        (f) => this.amounts(f).remaining > 0.009,
      ).length,
      amount_due: amountDue,
      currency: cabinet?.currency_symbol ?? cabinet?.currency ?? 'XAF',
      pending_payments_count: pendingPayments,
      pending_documents_count: pendingDocs,
      unread_messages_count: unreadMessages,
    };
  }

  // ── Documents ─────────────────────────────────────────────────────────────

  /**
   * Documents d'un dossier visibles du client : ceux qu'il a déposés, plus les
   * pièces validées du cabinet classées dans la catégorie « client » et non
   * confidentielles. Rien d'autre n'est exposé.
   */
  async listDocuments(user: any, dossierId: number) {
    const customerId = this.customerIdOf(user);
    await this.ownDossier(customerId, dossierId);

    const docs = await this.docRepo.find({
      where: { dossier_id: dossierId, is_current_version: true },
      relations: ['category'],
      order: { uploaded_at: 'DESC' },
      take: 300,
    });

    return docs
      .filter((d) => this.isVisibleToClient(d))
      .map((d) => this.toDocumentView(d));
  }

  private isFromClient(doc: DocumentCustomer): boolean {
    return doc.metadata?.source === 'client_portal';
  }

  private isVisibleToClient(doc: DocumentCustomer): boolean {
    if (doc.status === DocumentCustomerStatus.ARCHIVED) return false;
    if (this.isFromClient(doc)) return true;
    return (
      !doc.is_confidential &&
      doc.status === DocumentCustomerStatus.ACCEPTED &&
      doc.category?.code === 'client'
    );
  }

  private toDocumentView(doc: DocumentCustomer) {
    return {
      id: doc.id,
      name: doc.name,
      description: doc.description ?? null,
      status: doc.status,
      status_label: doc.status_label,
      from_client: this.isFromClient(doc),
      file_size: Number(doc.file_size) || 0,
      mimetype: doc.file_mimetype ?? null,
      uploaded_at: doc.uploaded_at,
    };
  }

  /** Dépôt d'un document : deux champs (titre + fichier), à valider par le cabinet. */
  async uploadDocument(
    user: any,
    dossierId: number,
    name: string | undefined,
    file?: Express.Multer.File,
  ) {
    const customerId = this.customerIdOf(user);
    await this.ownDossier(customerId, dossierId);

    if (!file) throw new BadRequestException('Aucun fichier reçu.');
    this.assertFile(file, DOCUMENT_MIMETYPES, CLIENT_DOCUMENT_MAX_BYTES);

    const title = (name ?? '').trim().slice(0, 150);
    if (!title) throw new BadRequestException('Indiquez un nom pour le document.');

    const category = await this.categoryRepo
      .findOne({ where: { code: 'client' } })
      .catch(() => null);

    const created = await this.documentService.create(
      {
        dossier_id: dossierId,
        name: title,
        category_id: category?.id,
        required_for_hearing: false,
        is_confidential: false,
        metadata: JSON.stringify({
          source: 'client_portal',
          original_filename: file.originalname,
        }),
        strict: true,
        file,
      } as any,
      Number(user.id),
      { status: DocumentCustomerStatus.PENDING },
    );

    return {
      id: created?.id,
      name: created?.name ?? title,
      status: DocumentCustomerStatus.PENDING,
      status_label: 'En attente de validation',
    };
  }

  /** Fichier d'un document visible du client (jamais d'URL publique). */
  async downloadDocument(user: any, documentId: number) {
    const customerId = this.customerIdOf(user);
    const doc = await this.docRepo.findOne({
      where: { id: documentId, customer_id: customerId },
      relations: ['category'],
    });
    if (!doc || !this.isVisibleToClient(doc)) {
      throw new NotFoundException('Document introuvable');
    }

    const nameForExt = doc.metadata?.original_filename || doc.name || '';
    const ext = path.extname(nameForExt).replace('.', '').toLowerCase();
    const type =
      doc.file_mimetype && doc.file_mimetype.includes('/')
        ? doc.file_mimetype
        : this.documentService.getMimeType(ext);
    const opts = {
      type,
      disposition: inlineContentDisposition(
        doc.metadata?.original_filename || doc.name,
      ),
    };

    if (doc.file_path) {
      const filePath = doc.file_path
        .replace(/\//g, path.sep)
        .replace(/\\/g, path.sep);
      if (fs.existsSync(filePath)) {
        return new StreamableFile(fs.readFileSync(filePath), opts);
      }
    }
    throw new NotFoundException('Fichier introuvable');
  }

  // ── Factures & paiements ──────────────────────────────────────────────────

  async listFactures(user: any) {
    const customerId = this.customerIdOf(user);
    const factures = await this.factureRepo.find({
      where: {
        client_id: customerId,
        status: statusIn(VISIBLE_FACTURE_STATUSES),
        original_facture_id: IsNull(),
      },
      relations: ['paiements', 'dossier'],
      order: { dateFacture: 'DESC' },
      take: 200,
    });
    return factures.map((f) => this.toFactureView(f));
  }

  async getFacture(user: any, factureId: string) {
    const customerId = this.customerIdOf(user);
    const facture = await this.ownFacture(customerId, factureId);
    const cabinet = await this.cabinet();

    return {
      ...this.toFactureView(facture),
      paiements: (facture.paiements ?? [])
        .filter((p) => Number(p.status) !== StatutPaiement.ANNULE)
        .sort(
          (a, b) =>
            new Date(b.datePaiement).getTime() -
            new Date(a.datePaiement).getTime(),
        )
        .map((p) => ({
          id: p.id,
          montant: Number(p.montant),
          mode: MODE_LABELS[Number(p.modePaiement)] ?? 'Autre',
          date: p.datePaiement,
          reference: p.reference ?? null,
          status: Number(p.status),
          status_label: this.paymentStatusLabel(Number(p.status)),
          declared_by_client: !!p.declared_by_client,
        })),
      // Coordonnées pour régler par virement : celles du cabinet.
      payment_info: {
        bank_account: cabinet?.bank_account ?? null,
        cabinet_name: cabinet?.name ?? null,
      },
    };
  }

  /**
   * Le client déclare un paiement (virement, mobile money, chèque…). Il est
   * créé EN_ATTENTE : le cabinet le vérifie puis le valide (la facture ne
   * passe à « payée » qu'à ce moment) ou le rejette.
   */
  async declarePayment(
    user: any,
    factureId: string,
    body: {
      montant?: string | number;
      mode?: string;
      reference?: string;
      notes?: string;
      date?: string;
    },
    proof?: Express.Multer.File,
  ) {
    const customerId = this.customerIdOf(user);
    const facture = await this.ownFacture(customerId, factureId);

    if (!PAYABLE_FACTURE_STATUSES.includes(Number(facture.status))) {
      throw new BadRequestException("Cette facture n'est plus à régler.");
    }

    const montant = Number(String(body.montant ?? '').replace(',', '.'));
    if (!Number.isFinite(montant) || montant <= 0) {
      throw new BadRequestException('Indiquez un montant valide.');
    }
    const { remaining, pending } = this.amounts(facture);
    const available = remaining - pending;
    if (montant > available + 0.01) {
      throw new BadRequestException(
        pending > 0
          ? `Le montant dépasse le reste à payer (${available.toFixed(2)}) : un paiement de ${pending.toFixed(2)} est déjà en attente de validation.`
          : `Le montant dépasse le reste à payer (${remaining.toFixed(2)}).`,
      );
    }

    const mode = CLIENT_PAYMENT_MODES[String(body.mode ?? '').toLowerCase()];
    if (mode === undefined) {
      throw new BadRequestException('Mode de paiement invalide.');
    }

    const paidOn = this.parsePaymentDate(body.date);

    let preuve: string | undefined;
    if (proof) {
      this.assertFile(proof, PROOF_MIMETYPES, CLIENT_PROOF_MAX_BYTES);
      const uploaded = await FilesUtil.uploadFileV1(
        proof,
        join(UPLOAD_DOCS_PATH, 'paiements'),
        { maxSizeKB: 3000 },
      );
      preuve = uploaded.fileUrl;
    }

    const paiement = this.paiementRepo.create({
      facture,
      montant,
      modePaiement: mode,
      datePaiement: paidOn,
      dateValeur: paidOn,
      reference: (body.reference ?? '').trim().slice(0, 100) || undefined,
      notes: (body.notes ?? '').trim().slice(0, 1000) || undefined,
      status: StatutPaiement.EN_ATTENTE,
      declared_by_client: true,
      preuvePaiement: preuve,
    } as Partial<Paiement>);
    const saved = await this.paiementRepo.save(paiement);

    return {
      id: saved.id,
      montant,
      status: StatutPaiement.EN_ATTENTE,
      status_label: this.paymentStatusLabel(StatutPaiement.EN_ATTENTE),
    };
  }

  private toFactureView(f: Facture) {
    const { paid, pending, remaining } = this.amounts(f);
    const due = f.dateEcheance ? new Date(f.dateEcheance) : null;
    return {
      id: f.id,
      numero: f.numero,
      libelle: f.libelle ?? null,
      description: f.description ?? null,
      date_facture: f.dateFacture,
      date_echeance: f.dateEcheance,
      montant_ttc: Number(f.montantTTC),
      currency: f.currency ?? null,
      status: Number(f.status),
      status_label: this.factureStatusLabel(Number(f.status)),
      paid_amount: paid,
      pending_amount: pending,
      remaining_amount: Math.max(0, remaining),
      payable:
        PAYABLE_FACTURE_STATUSES.includes(Number(f.status)) &&
        remaining - pending > 0.009,
      overdue:
        remaining > 0.009 && !!due && due.getTime() < Date.now() - 86400000,
      dossier: f.dossier
        ? {
            id: f.dossier.id,
            dossier_number: f.dossier.dossier_number,
            object: f.dossier.object,
          }
        : null,
    };
  }

  /** Montants : payé (validé), en attente d'approbation, reste dû. */
  private amounts(f: Facture) {
    const total = Number(f.montantTTC) || 0;
    let paid = 0;
    let pending = 0;
    for (const p of f.paiements ?? []) {
      const status = Number(p.status);
      if (status === StatutPaiement.VALIDE) paid += Number(p.montant) || 0;
      else if (status === StatutPaiement.EN_ATTENTE)
        pending += Number(p.montant) || 0;
    }
    return { total, paid, pending, remaining: total - paid };
  }

  private factureStatusLabel(status: number): string {
    switch (status) {
      case StatutFacture.PAYEE:
        return 'Payée';
      case StatutFacture.PARTIELLEMENT_PAYEE:
        return 'Partiellement payée';
      case StatutFacture.IMPAYEE:
        return 'Impayée';
      default:
        return 'À régler';
    }
  }

  private paymentStatusLabel(status: number): string {
    switch (status) {
      case StatutPaiement.VALIDE:
        return 'Validé';
      case StatutPaiement.REJETE:
        return 'Rejeté';
      case StatutPaiement.ANNULE:
        return 'Annulé';
      default:
        return 'En attente de validation';
    }
  }

  private parsePaymentDate(value?: string): Date {
    if (!value) return new Date();
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException('Date de paiement invalide.');
    }
    if (date.getTime() > Date.now() + 86400000) {
      throw new BadRequestException(
        'La date de paiement ne peut pas être dans le futur.',
      );
    }
    return date;
  }

  // ── Messagerie ────────────────────────────────────────────────────────────

  async listMessages(user: any, dossierId?: number) {
    const customerId = this.customerIdOf(user);
    if (dossierId) await this.ownDossier(customerId, dossierId);

    const messages = await this.messageRepo.find({
      where: {
        customer_id: customerId,
        ...(dossierId ? { dossier_id: dossierId } : {}),
      },
      order: { created_at: 'DESC' },
      take: 200,
    });
    return messages.reverse().map((m) => this.toMessageView(m));
  }

  async sendMessage(user: any, content: string, dossierId?: number | null) {
    const customerId = this.customerIdOf(user);
    const text = (content ?? '').trim();
    if (!text) throw new BadRequestException('Le message est vide.');
    if (text.length > 4000) {
      throw new BadRequestException('Message trop long (4000 caractères max).');
    }
    if (dossierId) await this.ownDossier(customerId, dossierId);

    const author = await this.userRepo.findOne({
      where: { id: Number(user.id) },
      select: ['id', 'first_name', 'last_name'],
    });

    const message = await this.messageRepo.save(
      this.messageRepo.create({
        customer_id: customerId,
        dossier_id: dossierId ?? null,
        sender_type: 'client',
        sender_user_id: Number(user.id),
        sender_name:
          `${author?.first_name ?? ''} ${author?.last_name ?? ''}`.trim() ||
          null,
        content: text,
        read_by_client_at: new Date(),
      }),
    );
    return this.toMessageView(message);
  }

  async markMessagesRead(user: any) {
    const customerId = this.customerIdOf(user);
    await this.messageRepo.update(
      {
        customer_id: customerId,
        sender_type: 'cabinet',
        read_by_client_at: IsNull(),
      },
      { read_by_client_at: new Date() },
    );
    return { success: true };
  }

  private toMessageView(m: ClientMessage) {
    return {
      id: m.id,
      dossier_id: m.dossier_id,
      from: m.sender_type,
      sender_name: m.sender_name,
      content: m.content,
      created_at: m.created_at,
      // Lu par l'autre partie (client → cabinet) ou par le client (cabinet → client).
      read:
        m.sender_type === 'client'
          ? !!m.read_by_cabinet_at
          : !!m.read_by_client_at,
    };
  }

  // ── Côté cabinet : messagerie et accès d'un client ────────────────────────

  private async customerOrFail(customerId: number): Promise<Customer> {
    const customer = await this.customerRepo.findOne({
      where: { id: customerId },
    });
    if (!customer) throw new NotFoundException('Client introuvable');
    return customer;
  }

  /** Fil complet d'un client avec le cabinet (tous dossiers confondus). */
  async listMessagesForCabinet(customerId: number) {
    await this.customerOrFail(customerId);
    const messages = await this.messageRepo.find({
      where: { customer_id: customerId },
      order: { created_at: 'DESC' },
      take: 300,
    });
    const dossierIds = [
      ...new Set(
        messages.map((m) => m.dossier_id).filter((id): id is number => !!id),
      ),
    ];
    const dossiers = dossierIds.length
      ? await this.dossierRepo.find({
          where: { id: In(dossierIds) },
          select: ['id', 'dossier_number'],
        })
      : [];
    const numberById = new Map(dossiers.map((d) => [d.id, d.dossier_number]));

    return messages.reverse().map((m) => ({
      id: m.id,
      dossier_id: m.dossier_id,
      dossier_number: m.dossier_id ? numberById.get(m.dossier_id) ?? null : null,
      from: m.sender_type,
      sender_name: m.sender_name,
      content: m.content,
      created_at: m.created_at,
      read_by_client: !!m.read_by_client_at,
      read_by_cabinet: !!m.read_by_cabinet_at,
    }));
  }

  async replyAsCabinet(
    user: any,
    customerId: number,
    content: string,
    dossierId?: number | null,
  ) {
    await this.customerOrFail(customerId);
    const text = (content ?? '').trim();
    if (!text) throw new BadRequestException('Le message est vide.');
    if (text.length > 4000) {
      throw new BadRequestException('Message trop long (4000 caractères max).');
    }
    if (dossierId) await this.ownDossier(customerId, dossierId);

    const author = await this.userRepo.findOne({
      where: { id: Number(user.id) },
      select: ['id', 'first_name', 'last_name'],
    });
    const message = await this.messageRepo.save(
      this.messageRepo.create({
        customer_id: customerId,
        dossier_id: dossierId ?? null,
        sender_type: 'cabinet',
        sender_user_id: Number(user.id),
        sender_name:
          `${author?.first_name ?? ''} ${author?.last_name ?? ''}`.trim() ||
          null,
        content: text,
        read_by_cabinet_at: new Date(),
      }),
    );
    return { id: message.id, created_at: message.created_at };
  }

  async markReadByCabinet(customerId: number) {
    await this.customerOrFail(customerId);
    await this.messageRepo.update(
      {
        customer_id: customerId,
        sender_type: 'client',
        read_by_cabinet_at: IsNull(),
      },
      { read_by_cabinet_at: new Date() },
    );
    return { success: true };
  }

  /** Le client a-t-il un accès à son espace ? (pour la fiche client) */
  async accessStatus(customerId: number) {
    await this.customerOrFail(customerId);
    const account = await this.userRepo.findOne({
      where: { customer: { id: customerId } },
      select: ['id', 'username', 'email', 'status'],
    });
    const unread = await this.messageRepo.count({
      where: {
        customer_id: customerId,
        sender_type: 'client',
        read_by_cabinet_at: IsNull(),
      },
    });
    return {
      has_account: !!account,
      active: !!account && Number(account.status) === 1,
      username: account?.username ?? null,
      unread_messages_count: unread,
    };
  }

  // ── Utilitaires ───────────────────────────────────────────────────────────

  private assertFile(
    file: Express.Multer.File,
    allowed: Set<string>,
    maxBytes: number,
  ) {
    if (!allowed.has(file.mimetype)) {
      throw new BadRequestException(
        'Format non accepté (PDF, image, Word, Excel ou texte).',
      );
    }
    if (file.size > maxBytes) {
      throw new BadRequestException(
        `Fichier trop volumineux (${Math.round(maxBytes / 1024 / 1024)} Mo max).`,
      );
    }
  }

  private cabinet(): Promise<Cabinet | null> {
    return this.cabinetRepo
      .findOne({ where: { id: getCurrentTenantId() } })
      .catch(() => null);
  }
}
