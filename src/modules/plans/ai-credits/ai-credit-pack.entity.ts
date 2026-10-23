import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

/**
 * Pack de crédits IA vendu par la plateforme (niveau plateforme, sans
 * `tenant_id`). La marge se règle sur `price` ; le crédit lui-même vaut un coût
 * fournisseur fixe (réglage `ai_credits_v1`).
 */
@Entity('ai_credit_packs')
export class AiCreditPack {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'int' })
  credits: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  price: number;

  @Column({ type: 'varchar', length: 10, default: 'XAF' })
  currency: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description: string | null;

  @Column({ type: 'tinyint', default: 1, name: 'is_active' })
  is_active: boolean;

  @Column({ type: 'int', default: 0, name: 'sort_order' })
  sort_order: number;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
