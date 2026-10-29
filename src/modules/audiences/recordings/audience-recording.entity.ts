import { TenantEntity as BaseEntity } from 'src/core/entities/tenant.entity';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { Audience } from '../entities/audience.entity';

export enum RecordingTranscriptStatus {
  PENDING = 'pending',
  PROCESSING = 'processing',
  DONE = 'done',
  /** Aucune parole reconnue. */
  EMPTY = 'empty',
  FAILED = 'failed',
}

/**
 * Segment d'enregistrement audio d'une audience. Le navigateur coupe
 * l'enregistrement toutes les `segment_seconds` (réglage plateforme `audio`) :
 * chaque segment est un fichier autonome (webm/opus) téléversé dès sa fin.
 * Une « session » regroupe les segments d'un même enregistrement continu.
 * L'espace occupé (`file_size`) compte dans le quota du cabinet.
 */
@Entity('audience_recordings')
@Index('IDX_audience_recordings_session', ['audience_id', 'session_id', 'segment_index'])
export class AudienceRecording extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'audience_id' })
  @Index('IDX_audience_recordings_audience')
  audience_id: number;

  @ManyToOne(() => Audience, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'audience_id' })
  audience?: Audience;

  /** Identifiant de session généré par le navigateur (un enregistrement continu). */
  @Column({ name: 'session_id', length: 64 })
  session_id: string;

  /** Rang du segment dans la session (0 = premier). */
  @Column({ name: 'segment_index', type: 'int', default: 0 })
  segment_index: number;

  /** Chemin relatif à la racine du back (`uploads/audiences/<tenant>/<audience>/…`). */
  @Column({ name: 'file_path', length: 500 })
  file_path: string;

  @Column({
    name: 'file_size',
    type: 'bigint',
    default: 0,
    // bigint arrive en chaîne depuis MariaDB
    transformer: { to: (v: number) => v, from: (v: string | number) => Number(v) || 0 },
  })
  file_size: number;

  @Column({ name: 'duration_seconds', type: 'int', nullable: true })
  duration_seconds: number | null;

  @Column({ length: 100, default: 'audio/webm' })
  mime: string;

  @Column({ type: 'mediumtext', nullable: true })
  transcript: string | null;

  @Column({
    name: 'transcript_status',
    type: 'enum',
    enum: RecordingTranscriptStatus,
    nullable: true,
  })
  transcript_status: RecordingTranscriptStatus | null;

  @Column({ name: 'created_by', type: 'int', nullable: true })
  created_by: number | null;
}
