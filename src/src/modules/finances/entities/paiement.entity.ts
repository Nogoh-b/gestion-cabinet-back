import { BaseEntity } from "src/core/entities/baseEntity";
import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Facture } from "./facture.entity";

// src/modules/finances/entities/paiement.entity.ts
@Entity('paiements')
export class Paiement extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'payment_date', type: 'date', nullable: false })
  payment_date: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: false })
  amount: number;

  @Column({ name: 'payment_method', length: 50, nullable: false })
  payment_method: string;

  @Column({ name: 'reference', length: 100, nullable: true })
  reference: string;

  @ManyToOne(() => Facture, (facture) => facture.paiements, { nullable: false })
  @JoinColumn({ name: 'facture_id' })
  facture: Facture;
}