import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Plan } from 'src/modules/plans/entities/plan.entity';

export type CabinetStatus = 'active' | 'trial' | 'suspended';
export type CabinetPlan   =
  | 'free' | 'avocat' | 'cabinet' | 'firme'
  // legacy
  | 'starter' | 'pro' | 'business' | 'enterprise';

@Entity('cabinets')
export class Cabinet {
  @PrimaryGeneratedColumn()
  id: number;

  /**
   * Code court généré à la création — ex: "xk7m2p8a"
   * Utilisé pour les 2 modes de routing :
   *   subdomain : xk7m2p8a.mon-app.com
   *   path      : mon-app.com/t/xk7m2p8a
   */
  @Column({ unique: true, length: 12 })
  code: string;

  @Column()
  name: string;

  @Column({ default: 'trial' })
  status: CabinetStatus;

  /** Champ historique — conservé pour compatibilité. Utiliser activePlan pour les quotas. */
  @Column({ nullable: true })
  plan: CabinetPlan;

  /** Référence vers l'entité Plan (quotas, tarification, IA). */
  @Column({ type: 'int', nullable: true, name: 'plan_id' })
  plan_id: number | null;

  @ManyToOne(() => Plan, { nullable: true, eager: false })
  @JoinColumn({ name: 'plan_id' })
  activePlan: Plan;

  /** Mode de routing préféré pour ce cabinet */
  @Column({ default: 'path' })
  routing_mode: 'subdomain' | 'path';

  @Column({ nullable: true })
  trial_ends_at: Date;

  // ── Branding / coordonnées (utilisés dans les en-têtes/pieds d'e-mail) ─────

  /** URL du logo du cabinet (affiché dans l'en-tête des e-mails). */
  @Column({ type: 'varchar', length: 500, nullable: true, name: 'logo_url' })
  logo_url: string | null;

  /** Couleur principale de la marque (hex, ex: #1d4ed8) pour les e-mails. */
  @Column({ type: 'varchar', length: 20, nullable: true, name: 'brand_color' })
  brand_color: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'contact_email' })
  contact_email: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true, name: 'contact_phone' })
  contact_phone: string | null;

  @Column({ type: 'text', nullable: true })
  address: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  website: string | null;

  /** Texte de pied de page personnalisé pour les e-mails. */
  @Column({ type: 'text', nullable: true, name: 'email_footer' })
  email_footer: string | null;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
