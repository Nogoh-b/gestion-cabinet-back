// src/modules/finances/entities/facture.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn } from 'typeorm';
import { BaseEntity } from 'src/core/entities/baseEntity';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { Paiement } from './paiement.entity';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';

export enum FactureStatus {
  DRAFT = 0,
  SENT = 1,
  PAID = 2,
  OVERDUE = 3,
  CANCELLED = 4,
}

@Entity('factures')
export class Facture extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'invoice_number', length: 50, unique: true, nullable: false })
  invoice_number: string;

  @Column({ name: 'invoice_date', type: 'date', nullable: false })
  invoice_date: Date;

  @Column({ name: 'due_date', type: 'date', nullable: false })
  due_date: Date;

  @Column({ name: 'amount_ht', type: 'decimal', precision: 10, scale: 2, nullable: false })
  amount_ht: number;

  @Column({ name: 'amount_ttc', type: 'decimal', precision: 10, scale: 2, nullable: false })
  amount_ttc: number;

  @Column({ name: 'tva_rate', type: 'decimal', precision: 5, scale: 2, default: 20.0 })
  tva_rate: number;

  @Column({ 
    type: 'enum', 
    enum: FactureStatus, 
    default: FactureStatus.DRAFT 
  })
  status: FactureStatus;

  @Column({ type: 'text', nullable: true })
  description: string;

  @Column({ name: 'billing_type', length: 50, nullable: true })
  billing_type: string;

  @Column({ name: 'hours_worked', type: 'decimal', precision: 6, scale: 2, nullable: true })
  hours_worked: number;

  @Column({ name: 'hourly_rate', type: 'decimal', precision: 8, scale: 2, nullable: true })
  hourly_rate: number;

  // Relations
  @ManyToOne(() => Dossier, (dossier) => dossier.factures, { nullable: false })
  @JoinColumn({ name: 'dossier_id' })
  dossier: Dossier;

  @ManyToOne(() => Customer, { nullable: false })
  @JoinColumn({ name: 'client_id' })
  client: Customer;

  @OneToMany(() => Paiement, (paiement) => paiement.facture)
  paiements: Paiement[];

  // Getters
  get amount_paid(): number {
    return this.paiements?.reduce((total, paiement) => total + parseFloat(paiement.amount.toString()), 0) || 0;
  }

  get remaining_amount(): number {
    return this.amount_ttc - this.amount_paid;
  }

  get is_paid(): boolean {
    return this.remaining_amount <= 0;
  }

  get is_overdue(): boolean {
    return new Date(this.due_date) < new Date() && !this.is_paid;
  }
}