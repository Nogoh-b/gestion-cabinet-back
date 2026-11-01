import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TenantEntity } from '../entities/tenant.entity';

@Entity('audit_events')
@Index(['tenant_id', 'createdAt'])
@Index(['tenant_id', 'resourceType', 'resourceId'])
export class AuditEvent extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'actor_id', type: 'varchar', length: 80, nullable: true })
  actorId: string | null;

  @Column({ length: 120 })
  action: string;

  @Column({ name: 'resource_type', length: 100 })
  resourceType: string;

  @Column({ name: 'resource_id', length: 100 })
  resourceId: string;

  @Column({ name: 'dossier_id', type: 'int', nullable: true })
  dossierId: number | null;

  @Column({ name: 'before_state', type: 'json', nullable: true })
  beforeState: Record<string, any> | null;

  @Column({ name: 'after_state', type: 'json', nullable: true })
  afterState: Record<string, any> | null;

  @Column({ type: 'text', nullable: true })
  justification: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ name: 'request_id', type: 'varchar', length: 100, nullable: true })
  requestId: string | null;

  @Column({ name: 'previous_hash', type: 'char', length: 64, nullable: true })
  previousHash: string | null;

  @Column({ name: 'current_hash', type: 'char', length: 64 })
  currentHash: string;

  @CreateDateColumn({ name: 'occurred_at', type: 'datetime', precision: 6 })
  createdAt: Date;
}
