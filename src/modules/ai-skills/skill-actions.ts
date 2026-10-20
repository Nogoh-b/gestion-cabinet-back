// src/modules/ai-skills/skill-actions.ts
import { BadRequestException, Injectable } from '@nestjs/common';

import {
  AiActionDefinition,
  AiActionHandler,
  PreparedAiAction,
} from 'src/core/ai-database/write/ai-action.registry';
import { canonicalTargetType, recordId, SKILL_TARGET_TABLES, textToHtml } from 'src/core/ai-database/skills/skill-helpers';
import type { AiSkillTargetType } from 'src/core/ai-database/skills/ai-skill.types';
import { Permission } from 'src/core/enums/permission.enum';
import { MailService } from 'src/core/shared/emails/emails.service';
import { AudiencesService } from '../audiences/audiences.service';
import { ChatService } from '../chat/services/chat/chat.service';
import { ClientPortalService } from '../client-portal/client-portal.service';
import { DocumentCustomerService } from '../documents/document-customer/document-customer.service';
import { MailTemplateService } from '../mail-template/mail-template.service';
import { SkillTargetsService, TargetInfo } from './skill-targets.service';

const IRREVERSIBLE_EMAIL = "L'e-mail part dès la confirmation : il ne pourra pas être rappelé.";
const IRREVERSIBLE_MESSAGE = 'Le message est envoyé dès la confirmation : il ne pourra pas être retiré.';
/** Pièces jointes : au-delà, les serveurs de messagerie refusent souvent l'e-mail. */
const MAX_ATTACHMENTS_BYTES = 15 * 1024 * 1024;
const EMAIL = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;

/** Table d'action → type de cible (« dossiers » → dossier). */
function targetTypeOf(table: string | undefined, fallback: AiSkillTargetType): AiSkillTargetType {
  const entry = Object.entries(SKILL_TARGET_TABLES).find(([, value]) => value === table);
  return (entry?.[0] as AiSkillTargetType) ?? canonicalTargetType(table) ?? fallback;
}

/** « a@x.cm; b@y.cm » → liste d'adresses valides (erreur lisible sinon). */
export function parseEmailList(value: unknown, label: string): string[] {
  const items = String(value ?? '')
    .split(/[,;\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  const invalid = items.filter((item) => !EMAIL.test(item));
  if (invalid.length) throw new BadRequestException(`${label} : adresse invalide « ${invalid.join(', ')} ».`);
  return items;
}

/** « 2026-10-20 08:00:00 » (carte) ou ISO → Date future, sinon erreur lisible. */
export function parseSchedule(value: unknown, now = new Date()): Date | null {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const date = new Date(text.includes('T') ? text : text.replace(' ', 'T'));
  if (Number.isNaN(date.getTime())) throw new BadRequestException(`Date d'envoi illisible : « ${text} ».`);
  // Une heure déjà passée (de peu) part tout de suite plutôt que d'échouer.
  return date.getTime() <= now.getTime() + 60_000 ? null : date;
}

function documentIds(value: unknown): number[] {
  const list = Array.isArray(value) ? value : String(value ?? '').split(/[,;\s]+/);
  return [...new Set(list.map((item) => Number(item)).filter((id) => Number.isInteger(id) && id > 0))];
}

const scheduleLabel = (date: Date) =>
  date.toLocaleString('fr-FR', { dateStyle: 'long', timeStyle: 'short' });

/**
 * « Écris au client du dossier DOS-… pour lui confirmer l'audience » : même
 * envoi que le composer d'e-mail des fiches (aucune permission dédiée), habillé
 * aux couleurs du cabinet, et rangé dans l'historique de la fiche.
 */
@Injectable()
export class EnvoyerEmailAiAction implements AiActionHandler {
  readonly definition: AiActionDefinition = {
    name: 'envoyer_email',
    entity: 'customer',
    targets: ['dossiers', 'audiences', 'factures', 'diligences', 'employee', 'document_customer'],
    skillOnly: true,
    label: "Envoi d'un e-mail",
    description: "Envoie un e-mail rédigé (objet, message, pièces jointes de la GED) au client ou au collaborateur visé.",
    permission: '',
    params: [
      { name: 'to', label: 'Destinataire', description: "Par défaut, l'adresse du client (ou du collaborateur)." },
      { name: 'cc', label: 'Copie (Cc)' },
      { name: 'subject', label: 'Objet', required: true },
      { name: 'body', label: 'Message', required: true, kind: 'longtext' },
      { name: 'attachments', label: 'Pièces jointes', kind: 'multi', description: 'Documents du dossier à joindre.' },
      { name: 'scheduledAt', label: "Programmer l'envoi", kind: 'datetime', description: 'Vide : envoi immédiat.' },
    ],
    warning: IRREVERSIBLE_EMAIL,
  };

  constructor(
    private readonly targets: SkillTargetsService,
    private readonly mails: MailService,
    private readonly mailTemplates: MailTemplateService,
    private readonly documents: DocumentCustomerService,
  ) {}

  private async target(targetId: string | number, table?: string): Promise<TargetInfo> {
    const type = targetTypeOf(table, 'client');
    return this.targets.load({ type, table: SKILL_TARGET_TABLES[type], id: recordId(targetId) ?? 0, label: '' });
  }

  private recipients(info: TargetInfo, params: Record<string, any>): string[] {
    const to = params.to ? parseEmailList(params.to, 'Destinataire') : info.email ? [info.email] : [];
    if (!to.length) {
      throw new BadRequestException(`Aucune adresse e-mail enregistrée pour ${info.recipientName || info.label} : indiquez le destinataire.`);
    }
    return to;
  }

  async paramOptions(targetId: string | number, table: string) {
    const docs = await this.targets.attachableDocuments(await this.target(targetId, table));
    return {
      attachments: docs.map((doc) => ({
        value: doc.id,
        label: `${doc.name || (doc as any).original_name || `Document #${doc.id}`}${doc.file_size ? ` · ${Math.max(1, Math.round(doc.file_size / 1024))} Ko` : ''}`,
      })),
    };
  }

  async preview(targetId: string | number, params: Record<string, any>, table?: string): Promise<string> {
    const info = await this.target(targetId, table);
    const to = this.recipients(info, params);
    const attachments = documentIds(params.attachments).length;
    const scheduled = parseSchedule(params.scheduledAt);
    return [
      `À : ${to.join(', ')}`,
      params.cc ? `Cc : ${parseEmailList(params.cc, 'Copie').join(', ')}` : '',
      attachments ? `${attachments} pièce(s) jointe(s)` : '',
      scheduled ? `programmé le ${scheduleLabel(scheduled)}` : '',
    ].filter(Boolean).join(' · ');
  }

  async prepare(targetId: string | number, params: Record<string, any>, userId: string, table?: string): Promise<PreparedAiAction> {
    const info = await this.target(targetId, table);
    const to = this.recipients(info, params);
    const cc = params.cc ? parseEmailList(params.cc, 'Copie') : [];
    const scheduled = parseSchedule(params.scheduledAt);
    const subject = String(params.subject ?? '').trim();
    const body = String(params.body ?? '').trim();
    if (!subject || !body) throw new BadRequestException("L'objet et le message de l'e-mail sont requis.");

    const ids = documentIds(params.attachments);
    const docs = await this.targets.documentsByIds(ids);
    if (docs.length !== ids.length) throw new BadRequestException('Une pièce jointe est introuvable dans ce cabinet.');
    const size = docs.reduce((sum, doc) => sum + Number(doc.file_size ?? 0), 0);
    if (size > MAX_ATTACHMENTS_BYTES) throw new BadRequestException('Pièces jointes trop volumineuses (15 Mo au maximum).');

    return {
      data: info.resource,
      plannedMessage: `E-mail « ${subject} » à envoyer à ${to.join(', ')}.`,
      run: async () => {
        // Lues à l'envoi seulement : rien n'est chargé si le plan est abandonné.
        const attachments: Array<{ filename: string; content: string; contentType: string }> = [];
        for (const doc of docs) {
          const file = await this.documents.getBase64(doc.id);
          attachments.push({ filename: file.fileName || doc.name || `document-${doc.id}`, content: file.base64, contentType: file.mimeType });
        }
        await this.mails.createAndSend({
          to,
          ...(cc.length && { cc }),
          subject,
          html: await this.mailTemplates.wrapForCabinet(textToHtml(body)),
          text: body,
          ...(attachments.length && { attachments }),
          ...(scheduled && { scheduledAt: scheduled.toISOString() }),
          metadata: {
            linkedEntity: info.mailEntity,
            ...(info.mailParent && { parentRef: info.mailParent }),
            source: 'ai_skill',
            sentBy: userId,
          },
        } as any);
        return scheduled
          ? `E-mail « ${subject} » programmé le ${scheduleLabel(scheduled)} pour ${to.join(', ')}.`
          : `E-mail « ${subject} » envoyé à ${to.join(', ')}.`;
      },
    };
  }
}

/**
 * « Réponds au client dans son espace » : même message que le panneau
 * « Espace client » de la fiche client (le client est notifié).
 */
@Injectable()
export class MessagePortailAiAction implements AiActionHandler {
  readonly definition: AiActionDefinition = {
    name: 'message_portail',
    entity: 'customer',
    targets: ['dossiers'],
    skillOnly: true,
    label: "Message dans l'espace client",
    description: "Publie un message dans l'espace client (le client est prévenu par notification et e-mail).",
    permission: Permission.EDIT_CLIENT,
    params: [{ name: 'content', label: 'Message', required: true, kind: 'longtext', description: '4 000 caractères au maximum.' }],
    warning: IRREVERSIBLE_MESSAGE,
  };

  constructor(
    private readonly targets: SkillTargetsService,
    private readonly portal: ClientPortalService,
  ) {}

  private async customer(targetId: string | number, table?: string) {
    const type = targetTypeOf(table, 'client');
    const info = await this.targets.load({ type, table: SKILL_TARGET_TABLES[type], id: Number(targetId), label: '' });
    if (!info.client) throw new BadRequestException(`${info.label} n'a pas de client.`);
    return info;
  }

  async preview(targetId: string | number, _params: Record<string, any>, table?: string): Promise<string> {
    const info = await this.customer(targetId, table);
    const status = await this.portal.accessStatus(info.client!.id);
    const access = status.active
      ? 'accès actif'
      : status.has_account
        ? 'accès désactivé : le client verra le message à sa prochaine connexion'
        : "pas encore d'accès : envoyez-lui l'accès depuis sa fiche";
    return `Espace client de ${info.recipientName}${info.dossier ? ` · dossier ${info.dossier.dossier_number}` : ''} · ${access}`;
  }

  async prepare(targetId: string | number, params: Record<string, any>, userId: string, table?: string): Promise<PreparedAiAction> {
    const info = await this.customer(targetId, table);
    const content = String(params.content ?? '').trim();
    if (!content) throw new BadRequestException('Le message est vide.');
    if (content.length > 4000) throw new BadRequestException('Message trop long (4 000 caractères au maximum).');
    return {
      data: info.client!,
      plannedMessage: `Message à publier dans l'espace client de ${info.recipientName}.`,
      run: async () => {
        await this.portal.replyAsCabinet({ id: userId }, info.client!.id, content, info.dossier?.id ?? null);
        return `Message publié dans l'espace client de ${info.recipientName}.`;
      },
    };
  }
}

/** « Préviens Maître X que l'audience est avancée » : messagerie interne. */
@Injectable()
export class MessageCollaborateurAiAction implements AiActionHandler {
  readonly definition: AiActionDefinition = {
    name: 'message_collaborateur',
    entity: 'employee',
    skillOnly: true,
    label: 'Message interne',
    description: 'Envoie un message à un collaborateur dans la messagerie interne.',
    permission: '',
    params: [{ name: 'content', label: 'Message', required: true, kind: 'longtext' }],
  };

  constructor(
    private readonly targets: SkillTargetsService,
    private readonly chat: ChatService,
  ) {}

  async preview(targetId: string | number): Promise<string> {
    const info = await this.targets.load({ type: 'employee', table: 'employee', id: Number(targetId), label: '' });
    return `À : ${info.recipientName} (messagerie interne)`;
  }

  async prepare(targetId: string | number, params: Record<string, any>, userId: string): Promise<PreparedAiAction> {
    const info = await this.targets.load({ type: 'employee', table: 'employee', id: Number(targetId), label: '' });
    const content = String(params.content ?? '').trim();
    if (!content) throw new BadRequestException('Le message est vide.');
    return {
      data: info.employee!,
      plannedMessage: `Message à envoyer à ${info.recipientName}.`,
      run: async () => {
        const conversation = await this.chat.findOrCreateDirect(Number(userId), Number(info.id));
        await this.chat.sendMessage({ conversationId: conversation.id, content } as any, Number(userId));
        return `Message envoyé à ${info.recipientName} (messagerie interne).`;
      },
    };
  }
}

/** « Reporte l'audience au 12 novembre à 9 h » : même report que la fiche audience. */
@Injectable()
export class ReporterAudienceAiAction implements AiActionHandler {
  readonly definition: AiActionDefinition = {
    name: 'reporter_audience',
    entity: 'audiences',
    skillOnly: true,
    label: "Report de l'audience",
    description: "Reporte une audience : l'audience actuelle passe « reportée » et une nouvelle est créée à la date choisie.",
    permission: Permission.POSTPONE_AUDIENCE,
    params: [
      { name: 'audience_date', label: 'Nouvelle date', required: true, kind: 'datetime' },
      { name: 'reason', label: 'Motif du renvoi' },
      { name: 'room', label: 'Salle' },
    ],
  };

  constructor(
    private readonly targets: SkillTargetsService,
    private readonly audiences: AudiencesService,
  ) {}

  private parse(params: Record<string, any>): { date: Date; time: string } {
    const text = String(params.audience_date ?? '').trim();
    const date = new Date(text.includes('T') ? text : text.replace(' ', 'T'));
    if (!text || Number.isNaN(date.getTime())) throw new BadRequestException(`Nouvelle date illisible : « ${text} ».`);
    const time = /\d{2}:\d{2}/.exec(text.slice(10))?.[0] ?? '';
    return { date, time };
  }

  async preview(targetId: string | number, params: Record<string, any>): Promise<string> {
    const info = await this.targets.load({ type: 'audience', table: 'audiences', id: Number(targetId), label: '' });
    const { date, time } = this.parse(params);
    return `${info.label} → ${date.toLocaleDateString('fr-FR')}${time && time !== '00:00' ? ` à ${time}` : ''}`;
  }

  async prepare(targetId: string | number, params: Record<string, any>): Promise<PreparedAiAction> {
    const info = await this.targets.load({ type: 'audience', table: 'audiences', id: Number(targetId), label: '' });
    const { date, time } = this.parse(params);
    const day = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    return {
      data: info.resource,
      plannedMessage: `${info.label} à reporter au ${date.toLocaleDateString('fr-FR')}.`,
      run: async () => {
        const { replacement } = await this.audiences.postpone(Number(info.id), {
          audience_date: day as any,
          audience_time: time && time !== '00:00' ? time : (info.resource.audience_time ?? undefined),
          ...(params.reason && { reason: String(params.reason) }),
          ...(params.room && { room: String(params.room) }),
        } as any);
        return `Audience reportée au ${date.toLocaleDateString('fr-FR')} (nouvelle audience #${replacement.id}).`;
      },
    };
  }
}
