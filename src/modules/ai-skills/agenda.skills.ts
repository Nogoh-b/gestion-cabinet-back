// src/modules/ai-skills/agenda.skills.ts
import { Injectable } from '@nestjs/common';

import type { AiSkillContext, AiSkillDefinition, AiSkillHandler, AiSkillOutcome } from 'src/core/ai-database/skills/ai-skill.types';
import { todayFr } from 'src/core/ai-database/skills/skill-helpers';
import { Permission } from 'src/core/enums/permission.enum';
import { parsePaymentMode } from './skill-actions';
import { actionPlan, draftJson, isOutcome, str, targetOrClarify, toPlanDateTime } from './skill-drafting';
import { SkillTargetsService } from './skill-targets.service';

/**
 * Écriture guidée : le planificateur du chat ne voit que la table visée, puis
 * la carte de confirmation éditable habituelle (aucune écriture sans clic).
 */
abstract class GuidedWriteSkill implements AiSkillHandler {
  abstract readonly definition: AiSkillDefinition;
  protected abstract readonly table: string;
  /** Consigne ajoutée à la demande pour le planificateur. */
  protected abstract readonly instruction: string;

  async run(_ctx: AiSkillContext): Promise<AiSkillOutcome> {
    // Ajoutée à la demande enrichie (mentions @ et leurs ids compris) par le chat.
    return {
      type: 'write',
      tables: [this.table],
      instruction: `${this.instruction} Utilise les identifiants des entités mentionnées avec @ ; n'en invente aucun. Date du jour : ${todayFr()}.`,
    };
  }
}

@Injectable()
export class ProgrammerAudienceSkill implements AiSkillHandler {
  readonly definition: AiSkillDefinition = {
    code: 'programmer_audience',
    label: 'Programmer une audience',
    description: 'Crée l’audience d’un dossier (date, heure, juridiction, salle)',
    icon: 'calendar-plus',
    category: 'agenda',
    permissions: [Permission.CREATE_AUDIENCE],
    targets: ['dossier'],
    targetRequired: true,
    placeholder: 'Ex. audience le 12 novembre à 9 h au TPI de Douala, salle 3',
    examples: ['Audience de @dossier le 12/11 à 9 h, salle 3'],
    keywords: ['audience', 'programmer', 'planifier', 'agenda', 'tribunal', 'renvoi'],
  };

  constructor(private readonly targets: SkillTargetsService) {}

  async run(ctx: AiSkillContext): Promise<AiSkillOutcome> {
    const target = targetOrClarify(ctx, this.definition);
    if (isOutcome(target)) return target;
    const info = await this.targets.load(target);
    const draft = await draftJson<{
      audience_date?: string;
      room?: string;
      judge_name?: string;
      notes?: string;
      late_scheduling_reason?: string;
    }>(ctx, `Extrais de la demande la date et les informations d'une audience à programmer.
Dossier : ${info.label}
Date du jour : ${todayFr()}
Demande : ${ctx.question}

- Date sans année : la prochaine date à venir (après la date du jour).
- Heure : celle de la demande ; sinon 09:00.
- Si l'audience est dans moins de 48 heures et qu'un motif est indiqué dans la demande, reprends-le dans late_scheduling_reason.
- N'invente ni date, ni salle, ni juge, ni motif : vide si la demande ne les donne pas.

Réponds UNIQUEMENT en JSON : {"audience_date": "AAAA-MM-JJ HH:MM, vide si aucune date", "room": "salle ou vide", "judge_name": "magistrat ou vide", "notes": "notes ou vide", "late_scheduling_reason": "motif si < 48 h ou vide"}`, 800);
    const date = str(draft.audience_date);
    if (!/^\d{4}-\d{2}-\d{2}/.test(date)) {
      return { type: 'clarify', markdown: `❓ À quelle date programmer l'audience de ${info.label} ? Renvoyez la demande avec la date (et l'heure).` };
    }
    return {
      type: 'plan',
      plan: actionPlan('programmer_audience', 'dossiers', info.id, {
        audience_date: toPlanDateTime(date),
        room: str(draft.room, 100),
        judge_name: str(draft.judge_name, 150),
        notes: str(draft.notes, 1000),
        late_scheduling_reason: str(draft.late_scheduling_reason, 500),
      }, `Programmer une audience pour ${info.label}`),
    };
  }
}

@Injectable()
export class CreerDiligenceSkill extends GuidedWriteSkill {
  readonly definition: AiSkillDefinition = {
    code: 'creer_diligence',
    label: 'Créer une diligence',
    description: 'Tâche à faire sur un dossier, avec échéance et responsable',
    icon: 'list-checks',
    category: 'agenda',
    permissions: [Permission.CREATE_DILIGENCE],
    targets: ['dossier', 'employee'],
    placeholder: 'Ex. déposer les conclusions avant le 30/11, confiée à @collaborateur',
    keywords: ['diligence', 'tâche', 'todo', 'échéance', 'délai', 'rappel'],
  };
  protected readonly table = 'diligences';
  protected readonly instruction = 'Créer UNE diligence (INSERT diligences) sur le dossier mentionné, avec son échéance.';
}

/** Verbes et noms d'encaissement (demande normalisée : sans accents ni ponctuation). */
const PAYMENT_WORDS = '(?:recus?|recues?|encaisses?|encaissees?|payes?|payees?|regles?|reglees?|verses?|versees?|vires?|virees?|paiement|versement|reglement|acompte)';
/** « 1000 FCFA reçus… », « encaisse 250 000 F sur… » : un montant avec sa devise à proximité immédiate du mot d'encaissement. */
const PAYMENT_AMOUNT_PATTERN =
  `/(?:\\b\\d[\\d ]*\\s?(?:fcfa|xaf|cfa|francs?|f|eur|euros?)\\b(?:\\s+\\S+){0,6}\\s+\\b${PAYMENT_WORDS}\\b|\\b${PAYMENT_WORDS}\\b(?:\\s+\\S+){0,6}\\s+\\b\\d[\\d ]*\\s?(?:fcfa|xaf|cfa|francs?|f|eur|euros?)\\b)/`;
/** « Reçu par virement sur la facture… » : un moyen de paiement. */
const PAYMENT_MEANS_PATTERN =
  `/\\b${PAYMENT_WORDS}\\b(?:\\s+\\S+){0,6}\\s+\\b(?:par|en) (?:virement|cheque|especes|cash|mobile money|orange money|momo|carte bancaire)\\b/`;

@Injectable()
export class EnregistrerPaiementSkill implements AiSkillHandler {
  readonly definition: AiSkillDefinition = {
    code: 'enregistrer_paiement',
    label: 'Enregistrer un paiement',
    description: 'Paiement reçu sur une facture (montant, mode, date)',
    icon: 'wallet',
    category: 'agenda',
    permissions: [Permission.CREATE_PAIEMENT],
    targets: ['facture'],
    targetRequired: true,
    placeholder: 'Ex. 500 000 FCFA reçus par virement aujourd’hui sur @facture',
    keywords: ['paiement', 'encaissement', 'règlement', 'versement', 'reçu'],
    // Seule écriture guidée devinée : un encaissement chiffré ou par un moyen
    // de paiement (« 1000 FCFA reçus par virement sur FAC-… »), jamais une
    // question (« la facture a-t-elle été payée ? ») ni un décompte de créance.
    autoTriggers: [PAYMENT_AMOUNT_PATTERN, PAYMENT_MEANS_PATTERN],
    autoExclude: [
      'relance', 'relancer', 'impaye', 'impayes', 'devis',
      'decompte', 'decompter', 'creance', 'creances', 'interets', 'moratoires',
      'injonction', 'mise en demeure', 'assignation', 'ohada',
      // Questions : « la facture de 500 000 FCFA a-t-elle été payée ? »
      '/\\b(?:a t elle|a t il|ont ils|ont elles|est elle|est il|est ce qu|combien|pourquoi)\\b/',
    ],
  };

  constructor(private readonly targets: SkillTargetsService) {}

  async run(ctx: AiSkillContext): Promise<AiSkillOutcome> {
    const target = targetOrClarify(ctx, this.definition);
    if (isOutcome(target)) return target;
    const info = await this.targets.load(target);
    const defaultAmount = Number(info.resource?.montantTTC ?? info.resource?.montant_ttc ?? 0);
    const draft = await draftJson<{
      montant?: number;
      modePaiement?: string;
      datePaiement?: string;
      reference?: string;
      banque?: string;
      numeroCheque?: string;
      notes?: string;
    }>(ctx, `Extrais de la demande les informations du paiement reçu sur la facture.
Facture : ${info.label}${defaultAmount > 0 ? ` (montant TTC : ${defaultAmount} FCFA)` : ''}
Date du jour : ${todayFr()}
Demande : ${ctx.question}

- montant : montant payé en FCFA (nombre positif ; si la demande dit que la facture est intégralement réglée sans préciser le montant, utilise ${defaultAmount || 0}).
- modePaiement : "virement", "cheque", "especes", "carte", "prelevement", "mobile" ou "autre" (par défaut "virement").
- datePaiement : "AAAA-MM-JJ" (date du paiement indiquée dans la demande, sinon la date du jour).
- N'invente ni référence, ni banque, ni numéro de chèque, ni notes : vide si la demande ne les donne pas.

Réponds UNIQUEMENT en JSON : {"montant": 0, "modePaiement": "virement", "datePaiement": "AAAA-MM-JJ", "reference": "", "banque": "", "numeroCheque": "", "notes": ""}`, 800);
    const montant = Number(draft.montant ?? 0) || defaultAmount;
    if (!(montant > 0)) {
      return { type: 'clarify', markdown: `❓ Quel est le montant reçu sur ${info.label} ? Renvoyez la demande avec le montant encaissé.` };
    }
    const todayIso = new Date().toISOString().slice(0, 10);
    const dateStr = /^\d{4}-\d{2}-\d{2}/.test(str(draft.datePaiement)) ? str(draft.datePaiement).slice(0, 10) : todayIso;
    return {
      type: 'plan',
      plan: actionPlan('enregistrer_paiement', 'factures', info.id, {
        montant: Math.round(montant),
        modePaiement: parsePaymentMode(draft.modePaiement),
        datePaiement: toPlanDateTime(dateStr),
        reference: str(draft.reference, 100),
        banque: str(draft.banque, 100),
        numeroCheque: str(draft.numeroCheque, 100),
        notes: str(draft.notes, 500),
      }, `Enregistrer un paiement de ${Math.round(montant).toLocaleString('fr-FR')} FCFA sur ${info.label}`),
    };
  }
}

/** « Reporte l'audience au 12 novembre à 9 h » : action de report de la fiche audience. */
@Injectable()
export class ReporterAudienceSkill implements AiSkillHandler {
  readonly definition: AiSkillDefinition = {
    code: 'reporter_audience',
    label: 'Reporter une audience',
    description: "Renvoie l'audience à une nouvelle date (l'historique est gardé)",
    icon: 'calendar-clock',
    category: 'agenda',
    permissions: [Permission.POSTPONE_AUDIENCE],
    targets: ['audience'],
    targetRequired: true,
    placeholder: 'Nouvelle date et motif (ex. renvoyée au 12/11 à 9 h, absence du juge)',
    keywords: ['reporter', 'report', 'renvoi', 'renvoyer', 'décaler', 'audience'],
  };

  constructor(private readonly targets: SkillTargetsService) {}

  async run(ctx: AiSkillContext): Promise<AiSkillOutcome> {
    const target = targetOrClarify(ctx, this.definition);
    if (isOutcome(target)) return target;
    const info = await this.targets.load(target);
    // Sans heure dans la demande, l'audience reportée garde son heure actuelle.
    const time = /^\d{2}:\d{2}/.test(String(info.resource?.audience_time ?? '')) ? String(info.resource.audience_time).slice(0, 5) : '';
    const draft = await draftJson<{ audience_date?: string; reason?: string; room?: string }>(ctx, `Extrais de la demande la nouvelle date d'une audience reportée.
Audience actuelle : ${info.label}${time ? ` à ${time}` : ''}
Date du jour : ${todayFr()}
Demande : ${ctx.question}

- Date sans année : la prochaine date à venir (après la date du jour).
- Heure : celle de la demande ; sinon ${time ? `l'heure actuelle (${time})` : '00:00'}.
- N'invente ni date, ni motif, ni salle : vide si la demande ne les donne pas.

Réponds UNIQUEMENT en JSON : {"audience_date": "AAAA-MM-JJ HH:MM, vide si aucune date", "reason": "motif du renvoi ou vide", "room": "nouvelle salle ou vide"}`, 800);
    let date = str(draft.audience_date);
    if (time && /^\d{4}-\d{2}-\d{2}$/.test(date)) date = `${date} ${time}`;
    if (!/^\d{4}-\d{2}-\d{2}/.test(date)) {
      return { type: 'clarify', markdown: `❓ À quelle date reporter ${info.label} ? Renvoyez la demande avec la nouvelle date (et l'heure si elle change).` };
    }
    return {
      type: 'plan',
      plan: actionPlan('reporter_audience', 'audiences', info.id, {
        audience_date: toPlanDateTime(date),
        reason: str(draft.reason, 500),
        room: str(draft.room, 100),
      }, `Reporter ${info.label}`),
    };
  }
}
