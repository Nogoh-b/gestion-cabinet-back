import { referenceJson } from '../reference-json';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { ReferenceChange, ReferenceItem } from '../reference-data.types';

@Entity('reference_profiles')
export class ReferenceProfile {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ length: 150 }) name: string;
  @Column({ type: 'text', nullable: true }) description: string | null;
  @Column({ default: false }) is_default: boolean;
  @Column({ default: true }) is_active: boolean;
  @Column({ type: 'varchar', length: 36, nullable: true })
  published_revision_id: string | null;
  @Column({ type: 'varchar', length: 36, nullable: true }) draft_revision_id:
    | string
    | null;
  @CreateDateColumn() created_at: Date;
  @UpdateDateColumn() updated_at: Date;
}
@Entity('reference_revisions')
@Index(['profile_id', 'number'], { unique: true })
export class ReferenceRevision {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ length: 36 }) profile_id: string;
  @Column({ type: 'int' }) number: number;
  @Column({ length: 20, default: 'draft' }) status: 'draft' | 'published';
  @Column({ type: 'longtext', transformer: referenceJson })
  content: ReferenceItem[];
  @VersionColumn() lock_version: number;
  @Column({ type: 'int', nullable: true }) created_by: number | null;
  @Column({ type: 'int', nullable: true }) published_by: number | null;
  @Column({ type: 'datetime', nullable: true }) published_at: Date | null;
  @CreateDateColumn() created_at: Date;
}
@Entity('reference_tenant_bindings')
export class ReferenceTenantBinding {
  @Column({ type: 'int', primary: true }) cabinet_id: number;
  @Column({ length: 36 }) profile_id: string;
  @Column({ length: 36 }) revision_id: string;
  @Column({ type: 'json' }) currencies: Record<string, any>[];
  @UpdateDateColumn() updated_at: Date;
}
@Entity('reference_provenance')
@Index(['cabinet_id', 'kind', 'item_key'], { unique: true })
export class ReferenceProvenance {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'int' }) cabinet_id: number;
  @Column({ length: 60 }) kind: string;
  @Column({ length: 191 }) item_key: string;
  @Column({ type: 'varchar', length: 64, nullable: true }) local_id:
    | string
    | null;
  @Column({ length: 36 }) revision_id: string;
  @Column({ type: 'json' }) applied: ReferenceItem;
  @UpdateDateColumn() updated_at: Date;
}
@Entity('reference_deployments')
export class ReferenceDeployment {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ length: 36 }) revision_id: string;
  @Column({ length: 20, default: 'preview' }) status:
    | 'preview'
    | 'pending'
    | 'running'
    | 'completed'
    | 'failed';
  @Column({ type: 'int' }) created_by: number;
  @CreateDateColumn() created_at: Date;
  @UpdateDateColumn() updated_at: Date;
}
@Entity('reference_deployment_targets')
@Index(['deployment_id', 'cabinet_id'], { unique: true })
export class ReferenceDeploymentTarget {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ length: 36 }) deployment_id: string;
  @Column({ type: 'int' }) cabinet_id: number;
  @Column({ length: 20, default: 'preview' }) status:
    | 'preview'
    | 'pending'
    | 'completed'
    | 'failed';
  @Column({ type: 'longtext', transformer: referenceJson })
  changes: ReferenceChange[];
  @Column({ type: 'json' }) overrides: string[];
  @Column({ type: 'text', nullable: true }) error: string | null;
  @Column({ type: 'json', nullable: true }) result: Record<
    string,
    number
  > | null;
  @UpdateDateColumn() updated_at: Date;
}
@Entity('reference_ai_messages')
export class ReferenceAiMessage {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'int' }) admin_id: number;
  @Column({ length: 36 }) profile_id: string;
  @Column({ length: 20 }) role: 'user' | 'assistant';
  @Column({ type: 'text' }) content: string;
  @CreateDateColumn() created_at: Date;
}
@Entity('reference_ai_proposals')
export class ReferenceAiProposal {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'int' }) admin_id: number;
  @Column({ length: 36 }) profile_id: string;
  @Column({ length: 36 }) revision_id: string;
  @Column({ type: 'int' }) draft_version: number;
  @Column({ type: 'text' }) explanation: string;
  @Column({ type: 'longtext', transformer: referenceJson })
  items: ReferenceItem[];
  @Column({ type: 'json' }) warnings: string[];
  @Column({ default: false }) accepted: boolean;
  @CreateDateColumn() created_at: Date;
}
export const REFERENCE_ENTITIES = [
  ReferenceProfile,
  ReferenceRevision,
  ReferenceTenantBinding,
  ReferenceProvenance,
  ReferenceDeployment,
  ReferenceDeploymentTarget,
  ReferenceAiMessage,
  ReferenceAiProposal,
];
