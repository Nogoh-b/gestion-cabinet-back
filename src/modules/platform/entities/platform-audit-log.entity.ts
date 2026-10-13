import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Journal des actions de l'espace plateforme (connexions, actions sur les
 * cabinets, abonnements, paiements, configuration…). Distinct de
 * `activities_user` (audit propre à chaque cabinet).
 */
@Entity('platform_audit_logs')
@Index('IDX_platform_audit_created', ['created_at'])
@Index('IDX_platform_audit_cabinet', ['cabinet_id', 'created_at'])
@Index('IDX_platform_audit_admin', ['admin_id', 'created_at'])
export class PlatformAuditLog {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', name: 'admin_id', nullable: true })
  admin_id: number | null;

  @Column({ type: 'varchar', length: 150, name: 'admin_email', nullable: true })
  admin_email: string | null;

  /** Ex. `auth.login`, `cabinet.suspend`, `payment.refund`. */
  @Column({ type: 'varchar', length: 80 })
  action: string;

  @Column({ type: 'varchar', length: 50, name: 'target_type', nullable: true })
  target_type: string | null;

  @Column({ type: 'varchar', length: 64, name: 'target_id', nullable: true })
  target_id: string | null;

  @Column({ type: 'int', name: 'cabinet_id', nullable: true })
  cabinet_id: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  summary: string | null;

  @Column({ type: 'json', nullable: true })
  before: Record<string, any> | null;

  @Column({ type: 'json', nullable: true })
  after: Record<string, any> | null;

  @Column({ type: 'varchar', length: 10, nullable: true })
  method: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  path: string | null;

  @Column({ type: 'smallint', name: 'status_code', nullable: true })
  status_code: number | null;

  /** success | failure | denied */
  @Column({ type: 'varchar', length: 10, default: 'success' })
  outcome: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @Column({ type: 'varchar', length: 255, name: 'user_agent', nullable: true })
  user_agent: string | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
