import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { getCurrentTenantId } from 'src/core/tenant/tenant.context';
import {
  AudienceRecording,
  RecordingTranscriptStatus,
} from './audience-recording.entity';

/** Taille par défaut du texte remis aux compétences IA (caractères). */
export const TRANSCRIPT_DEFAULT_MAX = 30_000;

/** « Intervenant 2 : … » (aussi « Locuteur », « Speaker »). */
const SPEAKER_LINE = /^((?:intervenant|locuteur|speaker)\s*\d+)\s*:\s*/i;
const INAUDIBLE = /\[(?:inaudible|incompr[ée]hensible)s?\]/gi;

const STATUS_LABELS: Record<string, string> = {
  [RecordingTranscriptStatus.PENDING]: 'transcription en attente',
  [RecordingTranscriptStatus.PROCESSING]: 'transcription en cours',
  [RecordingTranscriptStatus.FAILED]: 'transcription échouée',
};

export interface MissingSegment {
  recordingId: number;
  /** Rang de l'enregistrement (1 = premier) et du segment dans celui-ci (1 = premier). */
  session: number;
  segment: number;
  /** Début / fin dans l'enregistrement (secondes), si les durées sont connues. */
  from: number | null;
  to: number | null;
  status: RecordingTranscriptStatus | null;
  label: string;
}

export interface AssembledTranscript {
  /** Texte complet : une prise de parole par paragraphe, repères des segments manquants. */
  text: string;
  sessions: number;
  segments: number;
  transcribed: number;
  /** Segments sans parole reconnue (silence). */
  empty: number;
  /** Segments non transcrits (en attente, en cours, échec, jamais demandés). */
  missing: MissingSegment[];
  /** Passages marqués [inaudible] par le moteur. */
  inaudible: number;
  /** Plus grand nombre d'intervenants distincts dans un enregistrement. */
  speakers: number;
  durationSeconds: number;
}

type Row = Pick<
  AudienceRecording,
  'id' | 'session_id' | 'segment_index' | 'duration_seconds' | 'transcript' | 'transcript_status' | 'created_at'
>;

interface Turn {
  speaker: string | null;
  text: string;
}

/** 65 → « 01:05 », 3725 → « 1:02:05 ». */
export function clockLabel(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mmss = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return h ? `${h}:${mmss}` : mmss;
}

/** Prises de parole d'un segment : une ligne « Intervenant N : » ouvre un tour. */
function turnsOf(text: string): Turn[] {
  const turns: Turn[] = [];
  for (const raw of String(text ?? '').replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    const match = SPEAKER_LINE.exec(line);
    if (match) {
      const speaker = match[1].replace(/\s+/g, ' ').replace(/^./, (c) => c.toUpperCase());
      turns.push({ speaker, text: line.slice(match[0].length).trim() });
    } else if (turns.length) {
      turns[turns.length - 1].text += ` ${line}`;
    } else {
      turns.push({ speaker: null, text: line });
    }
  }
  return turns.filter((turn) => turn.text);
}

/**
 * Assemble les segments d'une audience dans l'ordre (enregistrement, puis rang
 * du segment). Continuité des intervenants : un segment qui commence sans
 * intervenant, ou par celui qui parlait à la fin du segment précédent, poursuit
 * la même prise de parole. Un segment non transcrit coupe le fil : il est
 * signalé à sa place, et la parole reprend sans être rattachée à l'intervenant
 * d'avant. Fonction pure (testée sans base).
 */
export function assembleTranscript(rows: Row[]): AssembledTranscript {
  // Enregistrements dans l'ordre de leur premier segment reçu.
  const sessions = new Map<string, Row[]>();
  const sorted = [...rows].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime() || a.segment_index - b.segment_index || a.id - b.id,
  );
  for (const row of sorted) {
    const list = sessions.get(row.session_id) ?? [];
    list.push(row);
    sessions.set(row.session_id, list);
  }

  const blocks: string[] = [];
  const missing: MissingSegment[] = [];
  let transcribed = 0;
  let empty = 0;
  let inaudible = 0;
  let speakers = 0;
  let durationSeconds = 0;
  let sessionRank = 0;

  for (const list of sessions.values()) {
    sessionRank += 1;
    list.sort((a, b) => a.segment_index - b.segment_index || a.id - b.id);
    const turns: Array<Turn | { marker: string }> = [];
    const voices = new Set<string>();
    let offset: number | null = 0;
    let open = false; // le dernier tour peut être prolongé par le segment suivant

    list.forEach((row, position) => {
      const from = offset;
      const duration = row.duration_seconds ?? null;
      const to = from !== null && duration !== null ? from + duration : null;
      offset = to;
      durationSeconds += duration ?? 0;
      const status = row.transcript_status ?? null;
      const text = String(row.transcript ?? '').trim();

      if (status === RecordingTranscriptStatus.DONE && text) {
        transcribed += 1;
        inaudible += (text.match(INAUDIBLE) ?? []).length;
        const segmentTurns = turnsOf(text);
        segmentTurns.forEach((turn, index) => {
          if (turn.speaker) voices.add(turn.speaker);
          const last = turns[turns.length - 1];
          const continues = index === 0 && open && last && 'text' in last && (!turn.speaker || turn.speaker === last.speaker);
          if (continues) (last as Turn).text += ` ${turn.text}`;
          else turns.push({ ...turn });
        });
        open = segmentTurns.length > 0;
        return;
      }
      if (status === RecordingTranscriptStatus.EMPTY || (status === RecordingTranscriptStatus.DONE && !text)) {
        // Silence : la parole reprend après, sans continuité supposée.
        empty += 1;
        open = false;
        return;
      }
      const label = STATUS_LABELS[status ?? ''] ?? 'non transcrit';
      const range = from !== null && to !== null ? ` (${clockLabel(from)} – ${clockLabel(to)})` : '';
      missing.push({ recordingId: row.id, session: sessionRank, segment: position + 1, from, to, status, label });
      turns.push({ marker: `[Segment ${position + 1}${range} : ${label} — contenu manquant]` });
      open = false;
    });

    speakers = Math.max(speakers, voices.size);
    const body = turns
      .map((turn) => ('marker' in turn ? turn.marker : `${turn.speaker ? `${turn.speaker} : ` : ''}${turn.text}`))
      .join('\n\n');
    if (body) blocks.push(sessions.size > 1 ? `— Enregistrement ${sessionRank} —\n\n${body}` : body);
  }

  return {
    text: blocks.join('\n\n'),
    sessions: sessions.size,
    segments: rows.length,
    transcribed,
    empty,
    missing,
    inaudible,
    speakers,
    durationSeconds,
  };
}

/**
 * Texte borné à `max` caractères : début, extraits réguliers du milieu et fin,
 * chaque coupure marquée « […] ». `truncated` dit si le texte a été coupé.
 */
export function boundTranscript(text: string, max = TRANSCRIPT_DEFAULT_MAX): { text: string; truncated: boolean } {
  const clean = String(text ?? '').trim();
  if (clean.length <= max) return { text: clean, truncated: false };
  const cut = (value: string, size: number, fromEnd = false) => {
    if (value.length <= size) return value;
    if (fromEnd) {
      const slice = value.slice(value.length - size);
      const at = slice.indexOf('\n\n');
      return at >= 0 && at < size / 3 ? slice.slice(at + 2) : slice;
    }
    const slice = value.slice(0, size);
    const at = slice.lastIndexOf('\n\n');
    return at > size * 0.66 ? slice.slice(0, at) : slice;
  };
  const marker = (omitted: number) => `\n\n[… environ ${omitted.toLocaleString('fr-FR')} caractères non repris …]\n\n`;
  const room = max - 3 * 60;
  const head = cut(clean, Math.floor(room * 0.4));
  const tail = cut(clean, Math.floor(room * 0.35), true);
  const middleStart = head.length;
  const middleEnd = clean.length - tail.length;
  const middle = clean.slice(middleStart, middleEnd);
  // Deux extraits du milieu (au tiers et aux deux tiers), sur le reste du budget.
  const pieceSize = Math.floor((room - head.length - tail.length) / 2);
  const pieces: Array<{ start: number; text: string }> = [];
  if (pieceSize > 200) {
    for (const ratio of [1 / 3, 2 / 3]) {
      const start = Math.max(0, Math.floor(middle.length * ratio - pieceSize / 2));
      const from = middle.indexOf('\n\n', start);
      const begin = from >= 0 && from < start + pieceSize / 3 ? from + 2 : start;
      pieces.push({ start: begin, text: cut(middle.slice(begin), pieceSize) });
    }
  }
  let out = head;
  let cursor = 0;
  for (const piece of pieces) {
    if (piece.start < cursor) continue;
    out += marker(piece.start - cursor) + piece.text;
    cursor = piece.start + piece.text.length;
  }
  out += marker(middle.length - cursor) + tail;
  return { text: out, truncated: true };
}

/**
 * Transcription d'une audience prête pour l'IA : segments assemblés
 * (`assembleTranscript`), bornés en taille avec la troncature dite en clair,
 * et un en-tête qui annonce segments manquants et passages inaudibles.
 */
export function transcriptFacts(assembled: AssembledTranscript, max = TRANSCRIPT_DEFAULT_MAX): string {
  if (!assembled.segments) return '';
  const notes: string[] = [];
  notes.push(`${assembled.transcribed} segment(s) transcrit(s) sur ${assembled.segments}${assembled.sessions > 1 ? ` répartis en ${assembled.sessions} enregistrements` : ''}${assembled.durationSeconds ? `, durée enregistrée ${clockLabel(assembled.durationSeconds)}` : ''}`);
  if (assembled.missing.length) {
    notes.push(`SEGMENTS NON TRANSCRITS (contenu inconnu, à signaler, ne rien supposer) : ${assembled.missing
      .map((item) => `${assembled.sessions > 1 ? `enregistrement ${item.session}, ` : ''}segment ${item.segment}${item.from !== null && item.to !== null ? ` (${clockLabel(item.from)} – ${clockLabel(item.to)})` : ''} — ${item.label}`)
      .join(' ; ')}`);
  }
  if (assembled.empty) notes.push(`${assembled.empty} segment(s) sans parole reconnue`);
  if (assembled.inaudible) notes.push(`${assembled.inaudible} passage(s) marqué(s) [inaudible]`);
  if (assembled.sessions > 1) notes.push("la numérotation des intervenants peut changer d'un enregistrement à l'autre");
  if (!assembled.transcribed) {
    return `Transcription de l'audience : aucune parole transcrite (${notes.join(' ; ')}).`;
  }
  const bounded = boundTranscript(assembled.text, max);
  if (bounded.truncated) {
    notes.push(`TRANSCRIPTION TRONQUÉE : ${bounded.text.length.toLocaleString('fr-FR')} caractères repris sur ${assembled.text.length.toLocaleString('fr-FR')} (début, extraits du milieu et fin, coupures marquées […]) ; ne décris pas ce qui a été coupé`);
  }
  return `Transcription automatique de l'audience (enregistrement audio ; ${notes.join(' ; ')}). Les intervenants sont numérotés par le moteur, sans nom : ne leur attribue une identité que si la transcription la donne.\n"""\n${bounded.text}\n"""`;
}

/** Transcription assemblée des segments d'une audience (cabinet courant). */
@Injectable()
export class AudienceTranscriptService {
  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Segments de l'audience dans le cabinet courant. L'accès à l'audience
   * (dossier visible par le rôle) est vérifié par l'appelant.
   */
  async assemble(audienceId: number): Promise<AssembledTranscript> {
    const rows = await this.dataSource.getRepository(AudienceRecording).find({
      where: { tenant_id: getCurrentTenantId(), audience_id: audienceId } as any,
      select: ['id', 'session_id', 'segment_index', 'duration_seconds', 'transcript', 'transcript_status', 'created_at'],
      order: { created_at: 'ASC', segment_index: 'ASC', id: 'ASC' } as any,
    });
    return assembleTranscript(rows);
  }

  /** Texte pour les compétences IA ('' sans enregistrement). */
  async facts(audienceId: number, max = TRANSCRIPT_DEFAULT_MAX): Promise<string> {
    return transcriptFacts(await this.assemble(audienceId), max);
  }
}
