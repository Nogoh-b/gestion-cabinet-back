import {
  BusinessColumn,
  BusinessTable,
} from 'src/core/decorators/business-metadata.decorator';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import type { AiPlanPolicy } from 'src/core/ai-database/ai-subscription-policy';

@Entity('plans')
// Catalogue public : lisible par tout collaborateur, jamais modifié par l’IA.
@BusinessTable({
  label: "Plans d'abonnement",
  description:
    'Catalogue des plans proposés : nom, prix mensuel et annuel, quotas (collaborateurs, dossiers, clients, stockage) et modules inclus (paie, dépenses, facturation, rapports, IA). Le plan du cabinet : subscriptions.plan_id.',
  category: 'abonnement',
  readOnly: true,
})
export class Plan {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  id: number;

  @Column({ type: 'varchar', length: 100 })
  @BusinessColumn({
    label: 'Nom du plan',
    description: 'Nom commercial du plan',
    importance: 'critical',
  })
  name: string;

  @Column({ type: 'varchar', length: 50, unique: true })
  code: string;

  @Column({ type: 'text', nullable: true })
  description: string;

  // ── Quotas ────────────────────────────────────────────────────────────────

  @Column({ type: 'int', default: 5, name: 'max_employees' })
  @BusinessColumn({
    label: 'Collaborateurs max.',
    description: 'Nombre maximal de collaborateurs (-1 = illimité)',
  })
  max_employees: number;

  @Column({ type: 'int', default: 10, name: 'max_storage_gb' })
  @BusinessColumn({
    label: 'Stockage max. (Go)',
    description: 'Espace de stockage (-1 = illimité)',
  })
  max_storage_gb: number;

  @Column({ type: 'int', default: 100, name: 'max_dossiers' })
  @BusinessColumn({
    label: 'Dossiers max.',
    description: 'Nombre maximal de dossiers (-1 = illimité)',
  })
  max_dossiers: number;

  @Column({ type: 'int', default: 200, name: 'max_clients' })
  @BusinessColumn({
    label: 'Clients max.',
    description: 'Nombre maximal de clients (-1 = illimité)',
  })
  max_clients: number;

  @Column({ type: 'int', default: 1, name: 'max_branches' })
  @BusinessColumn({
    label: 'Agences max.',
    description: "Nombre maximal d'agences (-1 = illimité)",
  })
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

  @Column({
    type: 'varchar',
    length: 30,
    default: 'community',
    name: 'support_level',
  })
  support_level: string;

  // ── Intelligence artificielle ─────────────────────────────────────────────

  @Column({ type: 'tinyint', default: 0, name: 'ai_enabled' })
  ai_enabled: boolean;

  @Column({ type: 'int', nullable: true, name: 'ai_requests_per_month' })
  @BusinessColumn({
    label: 'Requêtes IA',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  ai_requests_per_month: number | null;

  /** Crédits IA par mois (1 crédit = `usd_per_credit` USD de coût fournisseur). NULL / -1 = illimité. */
  @Column({ type: 'int', nullable: true, name: 'ai_credits_per_month' })
  @BusinessColumn({
    label: 'Crédits IA',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  ai_credits_per_month: number | null;

  @Column({ type: 'json', nullable: true })
  @BusinessColumn({
    label: 'Politique IA',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  ai_policy: AiPlanPolicy | null;

  // ── Tarification ──────────────────────────────────────────────────────────

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    default: 0,
    name: 'price_monthly',
  })
  @BusinessColumn({
    label: 'Prix mensuel',
    description: 'Tarif mensuel',
    format: 'currency',
  })
  price_monthly: number;

  @Column({
    type: 'decimal',
    precision: 10,
    scale: 2,
    nullable: true,
    name: 'price_yearly',
  })
  @BusinessColumn({
    label: 'Prix annuel',
    description: 'Tarif annuel',
    format: 'currency',
  })
  price_yearly: number | null;

  // ── Fonctionnalités ───────────────────────────────────────────────────────

  @Column({ type: 'text', nullable: true })
  features: string;

  // ── État ──────────────────────────────────────────────────────────────────

  @Column({ type: 'tinyint', default: 1, name: 'is_active' })
  @BusinessColumn({
    label: 'Actif',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  is_active: boolean;

  // ── Essai configurable ──────────────────────────────────────────────────

  @Column({ type: 'tinyint', default: 0, name: 'trial_enabled' })
  trial_enabled: boolean;

  @Column({ type: 'int', default: 30, name: 'trial_days' })
  trial_days: number;

  @Column({ type: 'int', default: 0, name: 'min_commitment_months' })
  @BusinessColumn({
    label: 'Engagement minimal',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  min_commitment_months: number;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
