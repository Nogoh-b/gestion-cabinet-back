// src/facture/entities/facture.entity.ts

import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';
import { TenantEntity as BaseEntity } from 'src/core/entities/tenant.entity';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { InvoiceType } from 'src/modules/invoice-type/entities/invoice-type.entity';
import { StatutPaiement } from 'src/modules/paiement/dto/create-paiement.dto';
import { ProcedureInstance } from 'src/modules/procedure/entities/procedure-instance.entity';
import { StageVisit } from 'src/modules/procedure/entities/stage-visit.entity';
import { SubStageVisit } from 'src/modules/procedure/entities/sub-stage-visit.entity';
import { SubStage } from 'src/modules/procedure/entities/sub-stage.entity';
import {
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Column, OneToMany,
  ManyToOne,
  JoinColumn,
  BeforeInsert
} from 'typeorm';


import { Paiement } from '../../paiement/entities/paiement.entity';
import {
  InvoiceNature,
  InvoiceSettlementDisposition,
  StatutFacture,
  TypeFacture,
} from '../dto/create-facture.dto';


@Entity('factures')
@Index('UQ_factures_tenant_numero', ['tenant_id', 'numero'], {
  unique: true,
})
@BusinessTable({
  label: 'Factures',
  description: 'Gestion des factures émises aux clients. Les colonnes enum numériques doivent être filtrées avec leurs codes BD, notamment type et status.',
  icon: '💰',
  category: 'finance'
})
export class Facture extends BaseEntity {
  /**
   * Propriété TRANSIENT — lue par le FactureSubscriber pour décider
   * d'envoyer un e-mail au client (case « Notifier le client » du modal).
   * Non persistée en base.
   */
  notify_client?: boolean;

  @Column({ name: 'notify_client_requested', default: false })
  notifyClientRequested: boolean;

  @PrimaryGeneratedColumn('uuid')
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique de la facture (format UUID)',
    importance: 'low',
    group: 'technique',
    ignored: true
  })
  id: string;

  @Column({ name: 'dossier_id' })
  @BusinessColumn({
    label: 'Dossier',
    description: 'Identifiant du dossier associé à la facture',
    importance: 'critical',
    group: 'relation',
    ignored: true
  })
  dossier_id: number;

  @Column({ name: 'client_id' })
  @BusinessColumn({ 
    label: 'Client',
    description: 'Identifiant du client destinataire de la facture',
    importance: 'critical',
    group: 'relation',
    ignored: true
  })
  client_id: number; 

  @Column({
    type: 'enum',
    enum: TypeFacture,
    default: TypeFacture.HONORAIRES
  })
  @BusinessColumn({
    label: 'Type de facture',
    description: 'BD: 0=HONORAIRES, 1=FRAIS_PROCEDURE, 2=DILIGENCES, 3=AUTRES. En SQL utiliser le nombre, pas le libellé.',
    example: '0 = Honoraires, 1 = Frais de procédure, 2 = Diligences',
    importance: 'critical',
    group: 'classification'
  })
  type: TypeFacture;

  @Column()
  @BusinessColumn({
    label: 'Numéro de facture',
    description: 'Numéro unique de la facture (format: ANN/XXX/YY)',
    example: '2025/001/01, F-2025-001',
    importance: 'critical',
    group: 'identification'
  })
  numero: string;

  @Column({ name: 'date_facture', type: 'date' })
  @BusinessColumn({
    label: 'Date de facture',
    description: 'Date d\'émission de la facture',
    format: 'date',
    importance: 'high',
    group: 'dates'
  })
  dateFacture: Date;

  @Column({ name: 'date_echeance', type: 'date' })
  @BusinessColumn({
    label: "Date d'échéance",
    description: 'Date limite de paiement de la facture',
    format: 'date',
    importance: 'critical',
    group: 'dates'
  })
  dateEcheance: Date;

  @Column({ name: 'montant_ht', type: 'decimal', precision: 10, scale: 2 })
  @BusinessColumn({
    label: 'Montant HT',
    description: 'Montant hors taxes de la facture',
    unit: '€',
    format: 'currency',
    importance: 'critical',
    group: 'financier'
  })
  montantHT: number;

  @Column({ name: 'taux_tva', type: 'decimal', precision: 5, scale: 2 })
  @BusinessColumn({
    label: 'Taux TVA',
    description: 'Taux de TVA appliqué (0, 5.5, 10, 20%)',
    unit: '%',
    format: 'percentage',
    importance: 'high',
    group: 'financier'
  })
  tauxTVA: number;

  @Column({ name: 'montant_tva', type: 'decimal', precision: 10, scale: 2 })
  @BusinessColumn({
    label: 'Montant TVA',
    description: 'Montant de la TVA (HT × taux TVA)',
    unit: '€',
    format: 'currency',
    importance: 'high',
    group: 'financier'
  })
  montantTVA: number;

  @Column({ name: 'montant_ttc', type: 'decimal', precision: 10, scale: 2 })
  @BusinessColumn({
    label: 'Montant TTC',
    description: 'Montant total TTC de la facture (HT + TVA)',
    unit: '€',
    format: 'currency',
    importance: 'critical',
    group: 'financier'
  })
  montantTTC: number;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Description',
    description: 'Description détaillée des prestations ou produits facturés',
    importance: 'high',
    group: 'contenu'
  })
  description: string;

  @Column({
    type: 'enum',
    enum: StatutFacture,
    default: StatutFacture.BROUILLON
  })
  @BusinessColumn({
    label: 'Statut',
    description: 'BD: 0=BROUILLON, 1=ENVOYEE, 2=PARTIELLEMENT_PAYEE, 3=PAYEE, 5=ANNULEE, 6=VALIDEE. Le retard est calculé et non stocké.',
    example: 'status = 3 pour une facture payée',
    importance: 'critical',
    group: 'état'
  })
  status: StatutFacture;

  @Column({
    name: 'nature',
    type: 'enum',
    enum: InvoiceNature,
    default: InvoiceNature.STANDARD,
  })
  nature: InvoiceNature;

  @Column({
    name: 'settlement_disposition',
    type: 'enum',
    enum: InvoiceSettlementDisposition,
    default: InvoiceSettlementDisposition.NONE,
  })
  settlementDisposition: InvoiceSettlementDisposition;

  @Column({ name: 'original_invoice_id', type: 'uuid', nullable: true })
  originalInvoiceId: string | null;

  @ManyToOne(() => Facture, (invoice) => invoice.creditNotes, {
    nullable: true,
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'original_invoice_id' })
  originalInvoice: Facture | null;

  @OneToMany(() => Facture, (invoice) => invoice.originalInvoice)
  creditNotes: Facture[];

  @Column({ name: 'disposition_reason', type: 'text', nullable: true })
  dispositionReason: string | null;

  @Column({
    name: 'disposition_at',
    type: 'datetime',
    precision: 6,
    nullable: true,
  })
  dispositionAt: Date | null;

  @Column({
    name: 'disposition_by',
    type: 'varchar',
    length: 64,
    nullable: true,
  })
  dispositionBy: string | null;

  @Column({ name: 'notes_internes', type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Notes internes',
    description: 'Commentaires internes non visibles par le client',
    importance: 'low',
    group: 'interne'
  })
  notesInternes: string;

  /**
   * Code devise au moment de la création (ex: 'XAF', 'EUR', 'USD').
   * Figé à la création — une modification de devise cabinet ne rétrograde pas
   * les anciennes factures. Null = héritage avant migration (afficher la devise
   * courante du cabinet).
   */
  @Column({ type: 'varchar', length: 10, nullable: true, name: 'currency' })
  @BusinessColumn({
    label: 'Devise',
    description: 'Code ISO de la devise au moment de l\'émission (XAF, EUR, USD…)',
    importance: 'medium',
    group: 'financier'
  })
  currency: string | null;

  // @CreateDateColumn({ name: 'created_at' })
  // @BusinessColumn({
  //   label: 'Date de création',
  //   description: 'Date de création de la facture dans le système',
  //   format: 'date',
  //   importance: 'low',
  //   group: 'audit',
  //   ignored: true
  // })
  // created_at: Date;

  // @UpdateDateColumn({ name: 'updated_at' })
  // @BusinessColumn({
  //   label: 'Date de modification',
  //   description: 'Date de dernière modification',
  //   format: 'date',
  //   importance: 'low',
  //   group: 'audit',
  //   ignored: true
  // })
  // updated_at: Date;

  // Relations
  @OneToMany(() => Paiement, paiement => paiement.facture, { nullable: true })
  @BusinessColumn({
    label: 'Paiements',
    description: 'Liste des paiements associés à cette facture',
    importance: 'high',
    group: 'relation'
  })
  paiements: Paiement[];

  @ManyToOne(() => Dossier, { nullable: true })
  @JoinColumn({ name: 'dossier_id' })
  @BusinessColumn({
    label: 'Dossier',
    description: 'Dossier juridique associé à la facture',
    importance: 'critical',
    group: 'relation'
  })
  dossier: Dossier;

  @ManyToOne(() => InvoiceType, { nullable: true })
  @JoinColumn({ name: 'invoice_type_id' })
  @BusinessColumn({
    label: "Type d'honoraire",
    description: "Catégorie d'honoraire: forfaitaire, horaire, mixte",
    importance: 'medium',
    group: 'classification'
  })
  invoice_type: InvoiceType;

  @ManyToOne(() => Customer, { nullable: true })
  @JoinColumn({ name: 'client_id' })
  @BusinessColumn({
    label: 'Client',
    description: 'Client destinataire de la facture',
    importance: 'critical',
    group: 'relation'
  })
  client: Customer;

  @Column({ name: 'sub_stage_id', type: 'varchar', nullable: true })
  sub_stage_id: string;

  @ManyToOne(() => SubStage, (subStage) => subStage.factures, { nullable: true })
  @JoinColumn({ name: 'sub_stage_id' })
  subStage: SubStage;

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

  @Column({ name: 'procedure_instance_id', type: 'varchar', nullable: true })
  procedure_instance_id: string;

  @ManyToOne(() => ProcedureInstance, { nullable: true })
  @JoinColumn({ name: 'procedure_instance_id' })
  procedureInstance: ProcedureInstance;

  // ==================== GETTERS MÉTIER ====================

  @BusinessColumn({
    label: 'Montant payé',
    description: 'Somme des paiements validés',
    unit: '€',
    format: 'currency',
    importance: 'critical',
    group: 'financier'
  })
  get montantPaye(): number {
    if (!this.paiements || this.paiements.length === 0) return 0;
    return this.paiements
      .filter(p => p.status === StatutPaiement.VALIDE)
      .reduce((sum, p) => sum + Number(p.montant), 0);
  }

  get montantAvoirValide(): number {
    return (this.creditNotes ?? [])
      .filter(
        (credit) =>
          credit.nature === InvoiceNature.CREDIT_NOTE &&
          ![
            StatutFacture.BROUILLON,
            StatutFacture.ENVOYEE,
            StatutFacture.ANNULEE,
          ].includes(credit.status),
      )
      .reduce((sum, credit) => sum + Number(credit.montantTTC), 0);
  }

  @BusinessColumn({
    label: 'Reste à payer',
    description: 'Montant TTC - Montant payé',
    unit: '€',
    format: 'currency',
    importance: 'critical',
    group: 'financier'
  })
  get resteAPayer(): number {
    if (
      this.nature === InvoiceNature.CREDIT_NOTE ||
      this.status === StatutFacture.ANNULEE
    ) {
      return 0;
    }
    return Math.max(
      0,
      Number(this.montantTTC) - this.montantAvoirValide - this.montantPaye,
    );
  }

  @BusinessColumn({
    label: 'Jours de retard',
    description: "Nombre de jours de retard par rapport à la date d'échéance",
    unit: 'jours',
    importance: 'high',
    group: 'financier'
  })
  get jours_retard(): number {
    if (!this.dateEcheance) return 0;
    if (this.resteAPayer <= 0) return 0;
    const aujourdHui = new Date();
    const diff = aujourdHui.getTime() - new Date(this.dateEcheance).getTime();
    const jours = Math.floor(diff / (1000 * 60 * 60 * 24));
    return jours > 0 ? jours : 0;
  }

  @BusinessColumn({
    label: 'Est en retard',
    description: 'True si la facture est en retard de paiement (>0 jours et non payée)',
    importance: 'high',
    group: 'financier'
  })
  get is_en_retard(): boolean {
    return (
      this.jours_retard > 0 &&
      this.resteAPayer > 0 &&
      [StatutFacture.VALIDEE, StatutFacture.PARTIELLEMENT_PAYEE].includes(
        this.status,
      ) &&
      this.nature !== InvoiceNature.CREDIT_NOTE
    );
  }

  @BusinessColumn({
    label: 'Statut paiement',
    description: 'ENVOYEE (0 payé), PARTIELLEMENT_PAYEE (partiellement payé), PAYEE (total payé)',
    importance: 'critical',
    group: 'état'
  })
  get statut_paiement(): StatutFacture {
    if (
      this.nature === InvoiceNature.CREDIT_NOTE ||
      this.status === StatutFacture.ANNULEE
    ) {
      return this.status;
    }
    const netAmount = Number(this.montantTTC) - this.montantAvoirValide;
    if (this.montantPaye === 0) {
      return this.status === StatutFacture.VALIDEE
        ? StatutFacture.VALIDEE
        : StatutFacture.ENVOYEE;
    } else if (this.montantPaye > 0 && this.montantPaye < netAmount) {
      return StatutFacture.PARTIELLEMENT_PAYEE;
    } else if (this.montantPaye >= netAmount) {
      return StatutFacture.PAYEE;
    }
    return this.status;
  }

  @BusinessColumn({
    label: 'Type libellé',
    description: 'Libellé lisible du type de facture',
    importance: 'medium',
    group: 'classification'
  })
  get type_label(): string {
    const labels = {
      [TypeFacture.HONORAIRES]: 'Honoraires',
      [TypeFacture.FRAIS_PROCEDURE]: 'Frais de procédure',
      [TypeFacture.DILIGENCES]: 'Diligences',
      [TypeFacture.AUTRES]: 'Autres'
    };
    return labels[this.type] || String(this.type);
  }

  @BusinessColumn({
    label: 'Statut libellé',
    description: 'Libellé lisible du statut',
    importance: 'medium',
    group: 'état'
  })
  get status_label(): string {
    const labels = {
      [StatutFacture.BROUILLON]: 'Brouillon',
      [StatutFacture.ENVOYEE]: 'Envoyée',
      [StatutFacture.PARTIELLEMENT_PAYEE]: 'Partiellement payée',
      [StatutFacture.PAYEE]: 'Payée',
      [StatutFacture.ANNULEE]: 'Annulée',
      [StatutFacture.VALIDEE]: 'Validée',
    };
    return (labels[this.status] || String(this.status)) as string;
  }

  @BusinessColumn({
    label: 'Taux de facturation',
    description: 'Pourcentage du montant TTC par rapport au montant HT',
    unit: '%',
    importance: 'low',
    group: 'financier'
  })
  get billing_rate(): number {
    if (this.montantHT === 0) return 0;
    return Math.round((this.montantTTC / this.montantHT) * 100);
  }

  @BeforeInsert()
  beforeCreate() {
    this.status = this.status ?? StatutFacture.BROUILLON;
  }
}
