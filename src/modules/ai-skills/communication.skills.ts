// src/modules/ai-skills/communication.skills.ts
import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import type { AiSkillContext, AiSkillDefinition, AiSkillHandler, AiSkillOutcome } from 'src/core/ai-database/skills/ai-skill.types';
import { findTarget, htmlToText, SKILL_TARGET_TABLES, todayFr } from 'src/core/ai-database/skills/skill-helpers';
import { Permission } from 'src/core/enums/permission.enum';
import { Facture } from '../facture/entities/facture.entity';
import { MailTemplate } from '../mail-template/entities/mail-template.entity';
import { actionPlan, draftJson, DRAFTING_RULES, emailInText, isOutcome, requestBlock, senderLine, str, targetOrClarify, toPlanDateTime } from './skill-drafting';
import { SkillTargetsService, TargetInfo } from './skill-targets.service';

/** Catégorie des modèles du composer pour chaque type de cible. */
const TEMPLATE_CATEGORY: Record<string, string[]> = {
  dossier: ['dossier', 'general'],
  client: ['dossier', 'general'],
  audience: ['audience', 'dossier'],
  facture: ['billing'],
  diligence: ['dossier', 'audience'],
  document: ['dossier', 'general'],
  employee: ['dossier', 'audience', 'general'],
};

/** Contexte factuel commun : cible, expéditeur, date du jour. */
async function factsBlock(targets: SkillTargetsService, info: TargetInfo, ctx: AiSkillContext): Promise<string> {
  const sender = await targets.sender(ctx.userId);
  return [
    `Destinataire : ${info.recipientName || info.label}${info.type === 'employee' ? ' (collaborateur du cabinet)' : ''}`,
    await targets.facts(info, ctx.user),
    senderLine(sender),
    `Date du jour : ${todayFr()}`,
  ].filter(Boolean).join('\n');
}

/** Signature demandée : celle de l'expéditeur indiqué, sinon celle du cabinet. */
const SIGNATURE_RULE = "- Signe avec le nom de l'expéditeur indiqué (et son cabinet) ; s'il n'est pas indiqué, signe au nom du cabinet. N'invente pas de nom.";

// ── E-mail ──────────────────────────────────────────────────────────────────

@Injectable()
export class EnvoyerEmailSkill implements AiSkillHandler {
  readonly definition: AiSkillDefinition = {
    code: 'envoyer_email',
    label: 'Envoyer un e-mail',
    description: "Rédige l'e-mail (modèles du cabinet, pièces jointes) et l'envoie après validation",
    icon: 'mail',
    category: 'communication',
    targets: ['client', 'dossier', 'audience', 'facture', 'diligence', 'employee', 'document'],
    targetRequired: true,
    placeholder: "Que doit dire l'e-mail ? (ex. confirmer l'audience au client, demain à 8 h)",
    examples: ["Confirme au client la date de l'audience", 'Demande au client les pièces manquantes'],
    keywords: ['mail', 'email', 'e-mail', 'courriel', 'envoyer', 'écrire', 'message'],
    autoTriggers: ['mail', 'email', 'courriel'],
    autoExclude: ['facture', 'factures', 'impaye', 'impayes', 'relance', 'relancer', 'whatsapp'],
  };

  constructor(
    private readonly targets: SkillTargetsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /** Modèles du composer de la même catégorie : la rédaction s'en inspire. */
  private async templateHints(info: TargetInfo): Promise<string> {
    const categories = TEMPLATE_CATEGORY[info.type] ?? ['general'];
    const templates = await this.dataSource.getRepository(MailTemplate)
      .createQueryBuilder('t')
      .where('t.is_active = 1')
      .andWhere("t.code LIKE 'composer_%'")
      .andWhere('t.category IN (:...categories)', { categories })
      .orderBy('t.id', 'ASC')
      .take(3)
      .getMany()
      .catch(() => [] as MailTemplate[]);
    if (!templates.length) return '';
    return `Modèles d'e-mails du cabinet (inspire-toi du plus adapté ; remplace les {{variables}} par les informations fournies et retire les phrases dont la variable est inconnue ; ignore-les s'ils ne conviennent pas) :\n${templates
      .map((t) => `— ${t.name} : objet « ${t.subject} »\n${htmlToText(t.body_html).slice(0, 1200)}`)
      .join('\n\n')}`;
  }

  async run(ctx: AiSkillContext): Promise<AiSkillOutcome> {
    const target = targetOrClarify(ctx, this.definition);
    if (isOutcome(target)) return target;
    const info = await this.targets.load(target);

    let subject = str(ctx.params.subject, 250);
    let body = str(ctx.params.body);
    let to = str(ctx.params.to) || emailInText(ctx.question) || '';
    let scheduledAt = str(ctx.params.scheduledAt);
    if (!subject || !body) {
      const draft = await draftJson<{ subject?: string; body?: string; to?: string; scheduledAt?: string }>(ctx, `Tu rédiges un e-mail professionnel envoyé par un cabinet d'avocats.

${await factsBlock(this.targets, info, ctx)}

${await this.templateHints(info)}

${requestBlock(ctx)}

${DRAFTING_RULES}
- Commence par une formule d'appel (« Madame, Monsieur, » ou « Bonjour <nom>, »), termine par une formule de politesse puis la signature. Le corps ne répète pas l'objet.
${SIGNATURE_RULE}
- scheduledAt : seulement si l'utilisateur demande d'envoyer l'e-mail plus tard (« envoie-le demain à 8 h », « programme l'envoi lundi »). Une date citée dans le message (audience, délai, rendez-vous) n'est pas une date d'envoi : laisse alors scheduledAt vide.

Réponds UNIQUEMENT en JSON (retours à la ligne écrits \\n dans les chaînes) :
{"subject": "objet court", "body": "corps de l'e-mail", "to": "adresse e-mail si la demande en donne une, sinon vide", "scheduledAt": "AAAA-MM-JJ HH:MM ou vide"}`);
      subject = subject || str(draft.subject, 250);
      body = body || str(draft.body);
      to = to || (str(draft.to).includes('@') ? str(draft.to) : '');
      scheduledAt = scheduledAt || (/^\d{4}-\d{2}-\d{2}/.test(str(draft.scheduledAt)) ? str(draft.scheduledAt) : '');
    }
    return {
      type: 'plan',
      plan: actionPlan('envoyer_email', info.table, info.id, {
        to,
        subject,
        body,
        attachments: Array.isArray(ctx.params.attachments) ? ctx.params.attachments : undefined,
        scheduledAt: scheduledAt ? toPlanDateTime(scheduledAt) : undefined,
      }, `Envoyer un e-mail à ${info.recipientName || info.label} : « ${subject} »`),
    };
  }
}

// ── Espace client ───────────────────────────────────────────────────────────

@Injectable()
export class MessagePortailSkill implements AiSkillHandler {
  readonly definition: AiSkillDefinition = {
    code: 'message_portail',
    label: "Message à l'espace client",
    description: 'Publie un message dans l’espace client (le client est notifié)',
    icon: 'messages',
    category: 'communication',
    permissions: [Permission.EDIT_CLIENT],
    targets: ['client', 'dossier', 'facture', 'audience'],
    targetRequired: true,
    placeholder: 'Que voulez-vous dire au client dans son espace ?',
    examples: ['Informe le client que son dossier avance', 'Demande au client de déposer sa pièce d’identité'],
    keywords: ['portail', 'espace', 'client', 'message', 'publier'],
    autoTriggers: ['espace client', 'portail client', 'portail'],
    autoExclude: ['comment'],
  };

  constructor(private readonly targets: SkillTargetsService) {}

  async run(ctx: AiSkillContext): Promise<AiSkillOutcome> {
    const target = targetOrClarify(ctx, this.definition);
    if (isOutcome(target)) return target;
    const info = await this.targets.load(target);
    if (!info.client) return { type: 'clarify', markdown: `⚠️ ${info.label} n'est rattaché à aucun client.` };

    let content = str(ctx.params.content, 4000);
    if (!content) {
      const draft = await draftJson<{ content?: string }>(ctx, `Tu rédiges un message publié dans l'espace client en ligne d'un cabinet d'avocats (lu par le client).

${await factsBlock(this.targets, info, ctx)}

${requestBlock(ctx)}

${DRAFTING_RULES}
- Message court (moins de 1 500 caractères), clair, sans jargon inutile, signé.
${SIGNATURE_RULE}

Réponds UNIQUEMENT en JSON (retours à la ligne écrits \\n) : {"content": "le message"}`);
      content = str(draft.content, 4000);
    }
    // Le message vise le client ; le dossier précise le fil de discussion.
    const onDossier = info.dossier && ['dossier', 'facture', 'audience'].includes(info.type);
    return {
      type: 'plan',
      plan: actionPlan(
        'message_portail',
        onDossier ? 'dossiers' : 'customer',
        onDossier ? info.dossier!.id : info.client.id,
        { content },
        `Publier un message dans l'espace client de ${info.recipientName}`,
      ),
    };
  }
}

// ── Messagerie interne ──────────────────────────────────────────────────────

@Injectable()
export class MessageCollaborateurSkill implements AiSkillHandler {
  readonly definition: AiSkillDefinition = {
    code: 'message_collaborateur',
    label: 'Message à un collaborateur',
    description: 'Envoie un message dans la messagerie interne',
    icon: 'message-circle',
    category: 'communication',
    targets: ['employee'],
    targetRequired: true,
    placeholder: 'Que voulez-vous transmettre ? (mentionnez le collaborateur avec @)',
    examples: ["Préviens @Maître X que l'audience du dossier est avancée"],
    keywords: ['collaborateur', 'interne', 'collègue', 'message', 'chat', 'prévenir'],
  };

  constructor(private readonly targets: SkillTargetsService) {}

  async run(ctx: AiSkillContext): Promise<AiSkillOutcome> {
    const target = targetOrClarify(ctx, this.definition);
    if (isOutcome(target)) return target;
    const info = await this.targets.load(target);
    let content = str(ctx.params.content, 4000);
    if (!content) {
      // Un dossier mentionné en plus donne le contexte du message (ses faits, pas seulement son numéro).
      const dossierTarget = findTarget(ctx.references, ['dossier']);
      const dossier = dossierTarget ? await this.targets.load(dossierTarget).catch(() => null) : null;
      const draft = await draftJson<{ content?: string }>(ctx, `Tu rédiges un court message interne entre collaborateurs d'un cabinet d'avocats.

${await factsBlock(this.targets, info, ctx)}
${dossier ? `Dossier concerné :\n${await this.targets.facts(dossier, ctx.user)}` : ''}

${requestBlock(ctx)}

${DRAFTING_RULES}
- Ton direct et cordial (tutoiement si la demande l'utilise), 3 à 6 phrases, sans formule de lettre ni signature (la messagerie affiche l'expéditeur).

Réponds UNIQUEMENT en JSON (retours à la ligne écrits \\n) : {"content": "le message"}`, 1500);
      content = str(draft.content, 4000);
    }
    return {
      type: 'plan',
      plan: actionPlan('message_collaborateur', 'employee', info.id, { content }, `Envoyer un message à ${info.recipientName}`),
    };
  }
}

// ── WhatsApp (lien wa.me) ───────────────────────────────────────────────────

@Injectable()
export class WhatsappSkill implements AiSkillHandler {
  readonly definition: AiSkillDefinition = {
    code: 'whatsapp',
    label: 'Préparer un WhatsApp',
    description: 'Rédige le message ; vous l’envoyez depuis votre WhatsApp',
    icon: 'whatsapp',
    category: 'communication',
    permissions: [Permission.EDIT_CLIENT],
    targets: ['client', 'dossier', 'audience', 'facture'],
    targetRequired: true,
    placeholder: 'Que doit dire le message WhatsApp au client ?',
    examples: ["Rappelle au client l'audience de demain", 'Demande au client de passer signer'],
    keywords: ['whatsapp', 'sms', 'texto', 'téléphone', 'message'],
    autoTriggers: ['whatsapp', 'sms', 'texto'],
  };

  constructor(private readonly targets: SkillTargetsService) {}

  async run(ctx: AiSkillContext): Promise<AiSkillOutcome> {
    const target = targetOrClarify(ctx, this.definition);
    if (isOutcome(target)) return target;
    const info = await this.targets.load(target);
    if (!info.client) return { type: 'clarify', markdown: `⚠️ ${info.label} n'est rattaché à aucun client.` };

    let text = str(ctx.params.text, 3000);
    if (!text) {
      const draft = await draftJson<{ text?: string }>(ctx, `Tu rédiges un message WhatsApp envoyé par un cabinet d'avocats à son client.

${await factsBlock(this.targets, info, ctx)}

${requestBlock(ctx)}

${DRAFTING_RULES}
- Message bref (moins de 600 caractères), poli, lisible sur téléphone, signé. Pas d'émoji.
${SIGNATURE_RULE}

Réponds UNIQUEMENT en JSON (retours à la ligne écrits \\n) : {"text": "le message"}`, 1500);
      text = str(draft.text, 3000);
    }
    const phone = info.phone ?? '';
    return {
      type: 'message_draft',
      markdown: phone
        ? `Voici le message WhatsApp pour **${info.recipientName}**. Relisez-le, puis cliquez sur « Ouvrir WhatsApp » pour l'envoyer depuis votre téléphone ou WhatsApp Web.`
        : `Voici le message WhatsApp pour **${info.recipientName}**. Aucun numéro n'est enregistré sur sa fiche : saisissez-le dans la carte.`,
      draft: { channel: 'whatsapp', customerId: info.client.id, recipientName: info.recipientName, phone, text },
    };
  }
}

// ── Facturation : envoi et relance (actions existantes) ─────────────────────

@Injectable()
export class EnvoyerFactureSkill implements AiSkillHandler {
  readonly definition: AiSkillDefinition = {
    code: 'envoyer_facture',
    label: 'Envoyer une facture',
    description: 'Envoie la facture au client par e-mail, comme le bouton de la fiche',
    icon: 'receipt',
    category: 'communication',
    permissions: [Permission.EMAIL_FACTURE],
    targets: ['facture'],
    targetRequired: true,
    placeholder: 'Mentionnez la facture avec @ (une autre adresse e-mail est possible)',
    keywords: ['facture', 'envoyer', 'transmettre', 'honoraires'],
  };

  constructor(private readonly targets: SkillTargetsService) {}

  async run(ctx: AiSkillContext): Promise<AiSkillOutcome> {
    const target = targetOrClarify(ctx, this.definition);
    if (isOutcome(target)) return target;
    const info = await this.targets.load(target);
    return {
      type: 'plan',
      plan: actionPlan('envoyer_facture', 'factures', info.id, { email: emailInText(ctx.question) }, `Envoyer la ${info.label} au client`),
    };
  }
}

@Injectable()
export class RelancerImpayesSkill implements AiSkillHandler {
  readonly definition: AiSkillDefinition = {
    code: 'relancer_impayes',
    label: 'Relancer les impayés',
    description: 'Relance le client pour toutes les factures impayées du dossier',
    icon: 'send',
    category: 'communication',
    permissions: [Permission.EMAIL_FACTURE],
    targets: ['dossier', 'facture'],
    targetRequired: true,
    placeholder: 'Mentionnez le dossier (ou une de ses factures) avec @',
    keywords: ['relance', 'relancer', 'impayé', 'impayés', 'recouvrement', 'paiement'],
  };

  constructor(
    private readonly targets: SkillTargetsService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  async run(ctx: AiSkillContext): Promise<AiSkillOutcome> {
    const target = targetOrClarify(ctx, this.definition);
    if (isOutcome(target)) return target;
    let dossierId = target.id;
    if (target.type === 'facture') {
      const facture = await this.dataSource.getRepository(Facture).findOne({ where: { id: target.id } as any });
      if (!facture?.dossier_id) return { type: 'clarify', markdown: "⚠️ Cette facture n'est rattachée à aucun dossier : relancez depuis le dossier." };
      dossierId = facture.dossier_id;
    }
    const info = await this.targets.load({ type: 'dossier', table: SKILL_TARGET_TABLES.dossier, id: dossierId, label: '' });
    return {
      type: 'plan',
      plan: actionPlan('relancer_impayes', 'dossiers', info.id, {}, `Relancer le client pour les impayés du ${info.label}`),
    };
  }
}
