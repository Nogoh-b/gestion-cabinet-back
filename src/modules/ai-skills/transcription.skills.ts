// src/modules/ai-skills/transcription.skills.ts
import { Injectable } from '@nestjs/common';

import type {
  AiSkillContext,
  AiSkillDefinition,
  AiSkillFollowUp,
  AiSkillHandler,
  AiSkillOutcome,
  AiSkillTargetType,
  DocumentDraft,
} from 'src/core/ai-database/skills/ai-skill.types';
import { resolveSkillTarget } from 'src/core/ai-database/skills/skill-helpers';
import { documentHtml } from './document-markup';
import { customerName, draftAudience, SkillTargetsService, TargetInfo } from './skill-targets.service';

const TARGETS: AiSkillTargetType[] = ['dossier', 'client', 'audience'];

/** « Transcris l'enregistrement », « transcription de la réunion »… (pas « transcris ce scan »). */
const TRANSCRIBE_PATTERN =
  '/\\b(re)?transcri\\w*\\b.{0,40}\\b(audio|enregistrement|vocal|vocaux|reunion|entretien|audition|appel|conversation|dictee|message vocal)s?\\b/';

/** Texte transcrit → balisage du studio : intervenants en gras, un paragraphe par prise de parole. */
export function transcriptMarkup(text: string): string {
  return String(text ?? '')
    .replace(/\r\n?/g, '\n')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^((?:[Ii]ntervenant|[Ll]ocuteur|[Ss]peaker)\s*\d+|[A-ZÀ-Ý][\p{L}' .-]{1,40})\s*:\s+/u, (_match, speaker: string) => `**${speaker.trim()} :** `))
    .join('\n\n');
}

/**
 * Enregistrement mis par écrit : le chat a transcrit l'audio (dictée,
 * enregistrement, fichier) et le joint comme document « Transcription — … ».
 * La compétence l'ouvre dans la carte (relecture, Word, PDF, classement) et
 * propose d'en tirer un compte rendu, un procès-verbal ou une synthèse.
 */
@Injectable()
export class TranscrireAudioSkill implements AiSkillHandler {
  readonly definition: AiSkillDefinition = {
    code: 'transcrire_audio',
    label: 'Transcrire un enregistrement',
    description: 'Audio (entretien, réunion, audition) mis par écrit, puis compte rendu ou procès-verbal',
    icon: 'mic',
    category: 'analyse',
    targets: TARGETS,
    targetRequired: false,
    placeholder: 'Enregistrez ou joignez l’audio (bouton micro), puis précisez ce qu’il faut en faire',
    examples: ['Transcris l’enregistrement de l’entretien avec @client', 'Transcription de la réunion du 21/10'],
    keywords: ['transcrire', 'transcription', 'audio', 'enregistrement', 'vocal', 'micro', 'réunion', 'entretien', 'audition'],
    autoTriggers: [TRANSCRIBE_PATTERN],
  };

  constructor(private readonly targets: SkillTargetsService) {}

  async run(ctx: AiSkillContext): Promise<AiSkillOutcome> {
    let transcript = ctx.documents.find((doc) => /^transcription\b/i.test(doc.name))
      ?? (ctx.documents.length === 1 ? ctx.documents[0] : undefined);
    const target = resolveSkillTarget(ctx, TARGETS);
    const info: TargetInfo | null = target ? await this.targets.load(target).catch(() => null) : null;
    const checks = ['Transcription automatique : relisez les noms propres, les montants et les dates avant usage.'];
    // Audience enregistrée (fiche audience) : ses segments transcrits, assemblés.
    let recorded = false;
    if (!transcript?.content?.trim() && info?.type === 'audience') {
      const audience = await this.targets.audienceTranscript(info, ctx.user, Number.MAX_SAFE_INTEGER);
      if (audience && !audience.assembled.transcribed) {
        return {
          type: 'clarify',
          markdown: `🎙️ Les ${audience.assembled.segments} segment(s) enregistré(s) de l'${info.label.charAt(0).toLowerCase()}${info.label.slice(1)} ne sont pas encore transcrits : lancez la transcription depuis la fiche de l'audience (bloc « Enregistrement »), puis renvoyez la demande.`,
        };
      }
      if (audience) {
        recorded = true;
        transcript = { name: `Transcription — ${info.label}`, content: audience.assembled.text };
        const { missing, inaudible } = audience.assembled;
        if (missing.length) checks.push(`${missing.length} segment(s) non transcrit(s) : leur contenu manque (repères « contenu manquant » dans le texte).`);
        if (inaudible) checks.push(`${inaudible} passage(s) inaudible(s) dans l'enregistrement.`);
      }
    }
    if (!transcript?.content?.trim()) {
      return {
        type: 'clarify',
        markdown: '🎙️ Aucun enregistrement transcrit dans la demande : utilisez le bouton micro de la saisie (« Enregistrer et transcrire » ou « Transcrire un fichier audio »), puis renvoyez la demande.',
      };
    }
    const text = transcript.content.trim();
    const words = text.split(/\s+/).filter(Boolean).length;
    const speakers = new Set((text.match(/^intervenant\s*\d+/gim) ?? []).map((item) => item.toLowerCase())).size;
    const base = transcript.name.replace(/^transcription\s*[—–-]\s*/i, '').replace(/\.[a-z0-9]{2,5}$/i, '') || 'enregistrement';
    const name = `Transcription — ${base}`.slice(0, 120);
    const dossier = info?.dossier;
    const draft: DocumentDraft = {
      templateId: 0,
      templateCode: 'studio_document',
      templateName: name,
      entityType: 'general',
      ...(dossier && { dossierId: dossier.id, dossierLabel: dossier.dossier_number }),
      ...(dossier && draftAudience(info) && { audience: draftAudience(info) }),
      fileName: `${name}${dossier ? ` - ${dossier.dossier_number}` : ''}`.replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 120),
      variables: {},
      editable: [],
      ...(info?.client && { recipient: { type: 'client', id: info.client.id, label: customerName(info.client) } }),
      studio: {
        mode: 'document',
        html: documentHtml(transcriptMarkup(text)),
        title: '',
        sources: [{ name: recorded ? "Enregistrements de l'audience" : transcript.name, origin: recorded ? 'dossier' : 'chat' }],
        checks,
      },
    };

    const targetParam = target && { target: { type: target.type, id: target.id, label: target.label } };
    const source = { sourceText: text.slice(0, 120_000), sourceName: transcript.name };
    const followUps: AiSkillFollowUp[] = [
      {
        label: 'Compte rendu',
        skill: 'rediger_document',
        question: `Rédige le compte rendu de l'entretien d'après la transcription « ${base} ».`,
        params: { ...source, freeDraft: true, ...targetParam },
      },
      {
        label: 'Procès-verbal',
        skill: 'rediger_document',
        question: `Rédige le procès-verbal d'après la transcription « ${base} ».`,
        params: { ...source, freeDraft: true, ...targetParam },
      },
      {
        label: 'Synthèse et points clés',
        skill: 'rediger_document',
        question: `Rédige une note de synthèse (faits, demandes, engagements, points à vérifier, prochaines étapes) d'après la transcription « ${base} ».`,
        params: { ...source, freeDraft: true, ...targetParam },
      },
      ...(info?.type === 'audience'
        ? [
            // Enregistrements de l'audience : les compétences relisent eux-mêmes la transcription.
            { label: "Compte rendu d'audience", skill: 'compte_rendu_audience', question: recorded ? "Fais le compte rendu de l'audience d'après sa transcription." : `Fais le compte rendu de l'audience d'après la transcription « ${base} » :\n${text.slice(0, 15000)}`, ...(targetParam && { params: targetParam }) },
            ...(recorded
              ? [
                  { label: "Rapport d'audience", skill: 'rapport_audience', question: "Rédige le rapport d'audience d'après sa transcription.", params: { ...targetParam, kind: 'rapport' } },
                  { label: 'Projet de décision', skill: 'projet_decision_audience', question: "Rédige le projet de décision d'après la transcription de l'audience.", params: { ...targetParam } },
                ]
              : []),
          ]
        : []),
    ];
    return {
      type: 'document_draft',
      markdown: `🎙️ **${name}** — environ ${words.toLocaleString('fr-FR')} mots${speakers > 1 ? `, ${speakers} intervenants` : ''}${dossier ? `, pour le dossier **${dossier.dossier_number}**` : ''}.\n\nRelisez-la dans la carte (Word, PDF${dossier ? ', classement dans le dossier' : ''}), ou faites-en directement un document ci-dessous.`,
      draft,
      followUps,
    };
  }
}
