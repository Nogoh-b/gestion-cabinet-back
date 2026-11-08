import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/** Échange d'un admin avec l'assistant de la console (par admin, aucun partage). */
@Entity('platform_assistant_messages')
@Index('IDX_platform_assistant_messages_admin', ['admin_id', 'created_at'])
export class PlatformAssistantMessage {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'int' }) admin_id: number;
  @Column({ length: 20 }) role: 'user' | 'assistant';
  @Column({ type: 'text' }) content: string;
  @CreateDateColumn() created_at: Date;
}

export type PlatformAssistantProposalStatus =
  | 'pending'
  | 'executing'
  | 'accepted'
  | 'rejected'
  | 'stale';

/**
 * Action préparée par l'assistant, validée côté serveur et stockée telle
 * quelle : l'acceptation n'exécute que cette ligne, jamais un plan envoyé par
 * le client. `target_version` fige l'état du cabinet au moment de la proposition.
 */
@Entity('platform_assistant_proposals')
@Index('IDX_platform_assistant_proposals_admin', ['admin_id', 'status'])
export class PlatformAssistantProposal {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'int' }) admin_id: number;
  @Column({ type: 'int' }) cabinet_id: number;
  @Column({ length: 40 }) type: string;
  @Column({ type: 'json' }) params: Record<string, any>;
  @Column({ length: 255 }) title: string;
  @Column({ type: 'text' }) summary: string;
  @Column({ length: 64 }) target_version: string;
  @Column({ length: 20, default: 'pending' })
  status: PlatformAssistantProposalStatus;
  @Column({ type: 'datetime', nullable: true }) decided_at: Date | null;
  @CreateDateColumn() created_at: Date;
}
