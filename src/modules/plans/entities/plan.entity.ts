import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('plans')
export class Plan {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 100 })
  name: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  code: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  // ── Quotas ────────────────────────────────────────────────────────────────

  @Column({ type: 'int', default: 5, name: 'max_employees' })
  max_employees: number;

  @Column({ type: 'int', default: 10, name: 'max_storage_gb' })
  max_storage_gb: number;

  @Column({ type: 'int', default: 100, name: 'max_dossiers' })
  max_dossiers: number;

  @Column({ type: 'int', default: 200, name: 'max_clients' })
  max_clients: number;

  @Column({ type: 'int', default: 1, name: 'max_branches' })
  max_branches: number;

  @Column({ type: 'int', default: -1, name: 'max_audiences' })
  max_audiences: number;

  // ── Modules activables ─────────────────────────────────────────────────────

  @Column({ type: 'tinyint', default: 0, name: 'payroll_enabled' })
  payroll_enabled: boolean;

  @Column({ type: 'int', nullable: true, name: 'max_payslips_per_month' })
  max_payslips_per_month: number | null;

  @Column({ type: 'tinyint', default: 0, name: 'expenses_enabled' })
  expenses_enabled: boolean;

  @Column({ type: 'int', nullable: true, name: 'max_expenses_per_month' })
  max_expenses_per_month: number | null;

  @Column({ type: 'tinyint', default: 1, name: 'documents_enabled' })
  documents_enabled: boolean;

  @Column({ type: 'tinyint', default: 0, name: 'invoicing_enabled' })
  invoicing_enabled: boolean;

  @Column({ type: 'tinyint', default: 0, name: 'reporting_enabled' })
  reporting_enabled: boolean;

  @Column({ type: 'varchar', length: 30, default: 'community', name: 'support_level' })
  support_level: string;

  // ── Intelligence artificielle ─────────────────────────────────────────────

  @Column({ type: 'tinyint', default: 0, name: 'ai_enabled' })
  ai_enabled: boolean;

  @Column({ type: 'int', nullable: true, name: 'ai_requests_per_month' })
  ai_requests_per_month: number | null;

  // ── Tarification ──────────────────────────────────────────────────────────

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0, name: 'price_monthly' })
  price_monthly: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true, name: 'price_yearly' })
  price_yearly: number | null;

  // ── Fonctionnalités ───────────────────────────────────────────────────────

  @Column({ type: 'text', nullable: true })
  features: string;

  // ── État ──────────────────────────────────────────────────────────────────

  @Column({ type: 'tinyint', default: 1, name: 'is_active' })
  is_active: boolean;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
