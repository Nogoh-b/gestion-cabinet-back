import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';
import { TenantEntity } from 'src/core/entities/tenant.entity';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from 'src/modules/iam/user/entities/user.entity';

/** Sur quelle assiette le taux s'applique. */
export enum ContributionBase {
  /** Salaire brut total. */
  GROSS = 'gross',
  /** Base imposable (gains imposables uniquement). */
  TAXABLE = 'taxable',
  /** Montant fixe (le `rate` est interprété comme un montant, pas un %). */
  FIXED = 'fixed',
}

/** Qui supporte la cotisation. */
export enum ContributionPayer {
  /** Part salariale : génère une RETENUE sur le bulletin (diminue le net). */
  EMPLOYEE = 'employee',
  /** Part patronale : charge de l'employeur, hors net (comptabilisée séparément). */
  EMPLOYER = 'employer',
}

export enum PayrollContributionStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  RETIRED = 'retired',
}

/**
 * Barème de cotisation / retenue paramétrable, propre à chaque cabinet (tenant).
 *
 * Permet de modéliser CNPS, IRPP, CFC, CAC, redevances, etc. sans coder en dur
 * une législation. Le moteur applique chaque ligne active pour générer les
 * retenues salariales et les charges patronales d'un bulletin.
 *
 * ⚠️ Les taux seedés par défaut sont des valeurs CEMAC/Cameroun indicatives :
 *    elles DOIVENT être validées par le cabinet avant exploitation réelle.
 */
@Entity('payroll_contribution')
@Index('UQ_payroll_contribution_tenant_code_version', [
  'tenant_id',
  'code',
  'version',
], { unique: true })
@BusinessTable({
  label: 'Barème de cotisations',
  description: 'Règles de cotisations sociales et retenues fiscales appliquées à la paie (paramétrable par cabinet).',
  icon: '⚖️',
  category: 'rh',
})
export class PayrollContribution extends TenantEntity {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique de la cotisation',
    importance: 'low',
    group: 'technique', 
    ignored: true,
  })
  id: number;

  @Column({ type: 'varchar', length: 50 })
  @BusinessColumn({
    label: 'Code',
    description: 'Code technique de la cotisation',
    example: 'CNPS_PVID',
    importance: 'high',
    group: 'identification',
  })
  code: string;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({ type: 'varchar', length: 150 })
  @BusinessColumn({
    label: 'Libellé',
    description: 'Libellé affiché sur le bulletin',
    example: 'CNPS - Pension vieillesse (part salariale)',
    importance: 'high',
    group: 'identification',
  })
  label: string;

  @Column({ type: 'decimal', precision: 10, scale: 4 })
  @BusinessColumn({
    label: 'Taux ou montant',
    description: 'Pourcentage (ex: 4.2000 pour 4,2 %) ou montant fixe si base = fixed',
    example: '4.2000',
    importance: 'high',
    group: 'financier',
  })
  rate: number;

  @Column({ type: 'enum', enum: ContributionBase, default: ContributionBase.GROSS, name: 'base_type' })
  @BusinessColumn({
    label: 'Assiette',
    description: "BD: 'gross'=Brut, 'taxable'=Imposable, 'fixed'=Montant fixe.",
    importance: 'high',
    group: 'financier',
  })
  base_type: ContributionBase;

  @Column({ type: 'enum', enum: ContributionPayer })
  @BusinessColumn({
    label: 'Supporté par',
    description: "BD: 'employee'=Retenue salariale, 'employer'=Charge patronale.",
    importance: 'high',
    group: 'financier',
  })
  payer: ContributionPayer;

  @Column({ type: 'decimal', precision: 12, scale: 2, nullable: true })
  @BusinessColumn({
    label: 'Plafond',
    description: "Plafond mensuel de l'assiette (null = pas de plafond)",
    unit: 'XAF',
    importance: 'medium',
    group: 'financier',
  })
  ceiling: number | null;

  @Column({ type: 'varchar', length: 20, nullable: true, name: 'account_number' })
  @BusinessColumn({
    label: 'Compte comptable',
    description: 'Compte SYSCOHADA pour la comptabilisation (ex: 431)',
    example: '431',
    importance: 'low',
    group: 'comptabilite',
  })
  account_number: string | null;

  @Column({ type: 'boolean', default: false, name: 'is_active' })
  @BusinessColumn({
    label: 'Actif',
    description: 'Cotisation appliquée lors du calcul',
    importance: 'medium',
    group: 'statut',
  })
  is_active: boolean;

  @Column({
    type: 'enum',
    enum: PayrollContributionStatus,
    default: PayrollContributionStatus.DRAFT,
  })
  status: PayrollContributionStatus;

  @Column({ type: 'date', name: 'valid_from' })
  valid_from: Date;

  @Column({ type: 'date', nullable: true, name: 'valid_until' })
  valid_until: Date | null;

  @Column({
    type: 'datetime',
    precision: 6,
    nullable: true,
    name: 'published_at',
  })
  published_at: Date | null;

  @Column({ type: 'int', nullable: true, name: 'published_by_id' })
  published_by_id: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'published_by_id' })
  published_by: User | null;

  @Column({
    type: 'datetime',
    precision: 6,
    nullable: true,
    name: 'retired_at',
  })
  retired_at: Date | null;

  @Column({ type: 'int', nullable: true, name: 'retired_by_id' })
  retired_by_id: number | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'retired_by_id' })
  retired_by: User | null;

  @Column({ type: 'text', nullable: true, name: 'retirement_reason' })
  retirement_reason: string | null;

  @Column({ type: 'int', default: 100, name: 'sort_order' })
  @BusinessColumn({
    label: 'Ordre',
    description: "Ordre d'affichage / d'application",
    importance: 'low',
    group: 'identification',
  })
  sort_order: number;
}
