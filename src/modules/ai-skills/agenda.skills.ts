// src/modules/ai-skills/agenda.skills.ts
import { Injectable } from '@nestjs/common';

import type { AiSkillContext, AiSkillDefinition, AiSkillHandler, AiSkillOutcome } from 'src/core/ai-database/skills/ai-skill.types';
import { todayFr } from 'src/core/ai-database/skills/skill-helpers';
import { Permission } from 'src/core/enums/permission.enum';
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
export class ProgrammerAudienceSkill extends GuidedWriteSkill {
  readonly definition: AiSkillDefinition = {
    code: 'programmer_audience',
    label: 'Programmer une audience',
    description: 'Crée l’audience d’un dossier (date, heure, juridiction, salle)',
    icon: 'calendar-plus',
    category: 'agenda',
    permissions: [Permission.CREATE_AUDIENCE],
    targets: ['dossier'],
    placeholder: 'Ex. audience le 12 novembre à 9 h au TPI de Douala, salle 3',
    examples: ['Audience de @dossier le 12/11 à 9 h, salle 3'],
    keywords: ['audience', 'programmer', 'planifier', 'agenda', 'tribunal', 'renvoi'],
  };
  protected readonly table = 'audiences';
  protected readonly instruction = "Créer UNE audience (INSERT audiences) pour le dossier mentionné.";
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
/** « 1000 FCFA reçus… », « encaisse 250 000 F sur… » : un montant avec sa devise. */
const PAYMENT_AMOUNT_PATTERN =
  `/(?:\\b\\d[\\d ]*\\s?(?:fcfa|xaf|cfa|francs?|f|eur|euros?)\\b.*\\b${PAYMENT_WORDS}\\b|\\b${PAYMENT_WORDS}\\b.*\\b\\d[\\d ]*\\s?(?:fcfa|xaf|cfa|francs?|f|eur|euros?)\\b)/`;
/** « Reçu par virement sur la facture… » : un moyen de paiement. */
const PAYMENT_MEANS_PATTERN =
  `/\\b${PAYMENT_WORDS}\\b.*\\b(?:par|en) (?:virement|cheque|especes|cash|mobile money|orange money|momo|carte bancaire)\\b/`;

@Injectable()
export class EnregistrerPaiementSkill extends GuidedWriteSkill {
  readonly definition: AiSkillDefinition = {
    code: 'enregistrer_paiement',
    label: 'Enregistrer un paiement',
    description: 'Paiement reçu sur une facture (montant, mode, date)',
    icon: 'wallet',
    category: 'agenda',
    permissions: [Permission.CREATE_PAIEMENT],
    targets: ['facture'],
    placeholder: 'Ex. 500 000 FCFA reçus par virement aujourd’hui sur @facture',
    keywords: ['paiement', 'encaissement', 'règlement', 'versement', 'reçu'],
    // Seule écriture guidée devinée : un encaissement chiffré ou par un moyen
    // de paiement (« 1000 FCFA reçus par virement sur FAC-… »), jamais une
    // question (« la facture a-t-elle été payée ? »).
    autoTriggers: [PAYMENT_AMOUNT_PATTERN, PAYMENT_MEANS_PATTERN],
    autoExclude: [
      'relance', 'relancer', 'impaye', 'impayes', 'devis',
      // Questions : « la facture de 500 000 FCFA a-t-elle été payée ? »
      '/\\b(?:a t elle|a t il|ont ils|ont elles|est elle|est il|est ce qu|combien|pourquoi)\\b/',
    ],
  };
  protected readonly table = 'paiements';
  protected readonly instruction = 'Enregistrer UN paiement (INSERT paiements) sur la facture mentionnée : facture_id = id de la facture mentionnée, montant = le montant reçu, mode de paiement et date si la demande les donne (sinon : aujourd’hui).';
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
