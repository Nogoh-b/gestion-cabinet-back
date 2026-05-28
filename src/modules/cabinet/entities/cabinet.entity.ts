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
export type CabinetPlan   = 'starter' | 'pro' | 'enterprise';

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
  @Column({ nullable: true, name: 'plan_id' })
  plan_id: number;

  @ManyToOne(() => Plan, { nullable: true, eager: false })
  @JoinColumn({ name: 'plan_id' })
  activePlan: Plan;

  /** Mode de routing préféré pour ce cabinet */
  @Column({ default: 'path' })
  routing_mode: 'subdomain' | 'path';

  @Column({ nullable: true })
  trial_ends_at: Date;

  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
