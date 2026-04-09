// src/facture/entities/facture.entity.ts

import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToOne,
  JoinColumn,
  BeforeInsert
} from 'typeorm';


import { Paiement } from '../../paiement/entities/paiement.entity';
import { StatutFacture, TypeFacture } from '../dto/create-facture.dto';
import { InvoiceType } from 'src/modules/invoice-type/entities/invoice-type.entity';
import { StatutPaiement } from 'src/modules/paiement/dto/create-paiement.dto';
import { Step } from 'src/modules/dossiers/entities/step.entity';
import { SubStage } from 'src/modules/procedure/entities/sub-stage.entity';
import { ProcedureInstance } from 'src/modules/procedure/entities/procedure-instance.entity';
import { SubStageVisit } from 'src/modules/procedure/entities/sub-stage-visit.entity';
import { StageVisit } from 'src/modules/procedure/entities/stage-visit.entity';


@Entity('factures')
export class Facture {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'dossier_id' })
  dossier_id: number;

  @Column({ name: 'client_id' })
  client_id: number;

  @ManyToOne(() => Step, step => step.factures, { nullable: true })
  @JoinColumn({ name: 'step_id' })
  step: Step;

  @Column({ name: 'step_id', type: 'int', nullable: true })
  step_id: number;

  @Column({
    type: 'enum',
    enum: TypeFacture,
    default: TypeFacture.HONORAIRES
  })
  type: TypeFacture;

  @Column({ unique: true })
  numero: string;

  @Column({ name: 'date_facture', type: 'date' })
  dateFacture: Date;

  @Column({ name: 'date_echeance', type: 'date' })
  dateEcheance: Date;

  @Column({ name: 'montant_ht', type: 'decimal', precision: 10, scale: 2 })
  montantHT: number;

  @Column({ name: 'taux_tva', type: 'decimal', precision: 5, scale: 2 })
  tauxTVA: number;

  @Column({ name: 'montant_tva', type: 'decimal', precision: 10, scale: 2 })
  montantTVA: number;

  @Column({ name: 'montant_ttc', type: 'decimal', precision: 10, scale: 2 })
  montantTTC: number;

  // @Column({ name: 'montant_paye', type: 'int' })
  // montantPaye: number;

  // @Column({ name: 'reste_a_payer', type: 'decimal', precision: 10, scale: 2 })
  // resteAPayer: number;
 
  @Column({ type: 'text', nullable: true }) 
  description: string;

  @Column({
    type: 'enum',
    enum: StatutFacture,
    default: StatutFacture.BROUILLON
  })
  status: StatutFacture;

  @Column({ name: 'notes_internes', type: 'text', nullable: true })
  notesInternes: string;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  // Relations
  @OneToMany(() => Paiement, paiement => paiement.facture, { nullable: true })
  paiements: Paiement[];

  @ManyToOne(() => Dossier, { nullable: true })
  @JoinColumn({ name: 'dossier_id' })
  dossier: Dossier;

  @ManyToOne(() => InvoiceType, { nullable: true })
  @JoinColumn({ name: 'invoice_type_id' })
  invoice_type: InvoiceType;

  @ManyToOne(() => Customer, { nullable: true })
  @JoinColumn({ name: 'client_id' }) // correction: correspond à la colonne réelle
  client: Customer;

  @Column({ name: 'sub_stage_id', type: 'varchar', nullable: true })
  sub_stage_id: string;

  @ManyToOne(() => SubStage, (subStage) => subStage.factures, { nullable: true })
  @JoinColumn({ name: 'sub_stage_id' })
  subStage: SubStage;

  // @Column({ name: 'stage_id', type: 'varchar', nullable: true })
  // stage_id: string;

  // @ManyToOne(() => Stage)
  // @JoinColumn({ name: 'stageVisit_id' })
  // stage: Stage;
  @Column({ name: 'sub_stage_visit_id', type: 'varchar', nullable: true })
  sub_stage_visit_id: string;

  @ManyToOne(() => SubStageVisit, (subStageVisit) => subStageVisit.factures, { nullable: true })
  @JoinColumn({ name: 'sub_stage_visit_id' })
  subStageVisit: SubStageVisit;
  
  @Column({ name: 'stageVisit_id', type: 'varchar', nullable: true })
  stageVisit_id: string;


  @ManyToOne(() => StageVisit)
  @JoinColumn({ name: 'stageVisit_id' })
  stageVisit: StageVisit;


  // Garder aussi la liaison avec ProcedureInstance pour la vue globale
  @Column({ name: 'procedure_instance_id', type: 'varchar', nullable: true })
  procedure_instance_id: string;

  @ManyToOne(() => ProcedureInstance, { nullable: true })
  @JoinColumn({ name: 'procedure_instance_id' })
  procedureInstance: ProcedureInstance;


   get montantPaye(): number {
    if (!this.paiements || this.paiements.length === 0) return 0;
    
    // Ne prendre que les paiements validés
    return this.paiements
      .filter(p => p.status === StatutPaiement.VALIDE)
      .reduce((sum, p) => sum + Number(p.montant), 0);
  }

  get resteAPayer(): number {
    return Number(this.montantTTC) - this.montantPaye;
  }

  get jours_retard(): number {
    if (!this.dateEcheance) return 0;
    if (this.resteAPayer <= 0) return 0; // Si payée, pas de retard

    const aujourdHui = new Date();
    const diff = aujourdHui.getTime() - new Date(this.dateEcheance).getTime();
    const jours = Math.floor(diff / (1000 * 60 * 60 * 24));
    return jours > 0 ? jours : 0;
  }

  get is_en_retard(): boolean {
    return this.jours_retard > 0 && this.resteAPayer > 0;
  }

  get statut_paiement(): StatutFacture {
    if (this.montantPaye === 0) {
      return StatutFacture.ENVOYEE;
    } else if (this.montantPaye > 0 && this.montantPaye < Number(this.montantTTC)) {
      return StatutFacture.PARTIELLEMENT_PAYEE;
    } else if (this.montantPaye >= Number(this.montantTTC)) {
      return StatutFacture.PAYEE;
    }
    return this.status; // Garde le statut existant si aucun cas ne correspond
  }

  // Méthodes utilitaires
  ajouterPaiement(paiement: Paiement): void {
    if (!this.paiements) this.paiements = [];
    this.paiements.push(paiement);
    // Pas besoin de recalculer, les getters le feront automatiquement
  }

  // ---------- 🧮 Getters calculés ----------

  /**
   * Nombre de jours de retard par rapport à la date d'échéance.
   * Retourne 0 si la facture n'est pas encore échue.
   */
  // get jours_retard(): number {
  //   if (!this.dateEcheance) return 0;

  //   const aujourdHui = new Date();
  //   const diff = aujourdHui.getTime() - new Date(this.dateEcheance).getTime();
  //   const jours = Math.floor(diff / (1000 * 60 * 60 * 24));

  //   return jours > 0 ? jours : 0;
  // }



  // // ---------- 🧾 Méthodes utilitaires ----------

  // calculerResteAPayer(): void {
  //   this.resteAPayer = this.montantTTC - this.montantPaye;
  //   this.mettreAJourStatut();
  // }

  // ajouterPaiement(montant: number): void {
  //   this.montantPaye += Number(montant);
  //   this.calculerResteAPayer();
  // }

  private mettreAJourStatut(): void {
    if (this.montantPaye === 0) {
      this.status = StatutFacture.ENVOYEE;
    } else if (this.montantPaye > 0 && this.montantPaye < this.montantTTC) {
      this.status = StatutFacture.PARTIELLEMENT_PAYEE;
    } else if (this.montantPaye >= this.montantTTC) {
      this.status = StatutFacture.PAYEE;
    }
  }

  @BeforeInsert()
  beforeCreate() {
    this.status = this.status ??  StatutFacture.BROUILLON; 
    // this.status = this.status ?? CustomerStatus.ACTIVE;
  }
}
