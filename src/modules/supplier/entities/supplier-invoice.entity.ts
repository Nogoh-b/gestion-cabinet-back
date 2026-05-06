import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Supplier } from './supplier.entity';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';
import { Branch } from 'src/modules/agencies/branch/entities/branch.entity';
import { User } from 'src/modules/iam/user/entities/user.entity';

export enum SupplierInvoiceStatus {
  RECEIVED = 'received',
  APPROVED = 'approved',
  PAID = 'paid',
  CANCELLED = 'cancelled',
  DISPUTED = 'disputed',
}

export enum PaymentMethod {
  ESPECES = 'ESPECES',
  CHEQUE = 'CHEQUE',
  VIREMENT = 'VIREMENT',
  CARTE_BANCAIRE = 'CARTE_BANCAIRE',
  PRELEVEMENT = 'PRELEVEMENT',
  MOBILE_MONEY = 'MOBILE_MONEY',
}

@Entity('supplier_invoice')
@BusinessTable({
  label: 'Factures fournisseurs',
  description: 'Factures reçues des fournisseurs (charges de fonctionnement).',
  icon: '🧾',
  category: 'financier',
})
export class SupplierInvoice {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique de la facture fournisseur',
    importance: 'low',
    group: 'technique',
    ignored: true,
  })
  id: number;

  @Column({ type: 'int', name: 'supplier_id' })
  @BusinessColumn({
    label: 'Fournisseur',
    description: 'Identifiant du fournisseur',
    importance: 'high',
    group: 'relation',
    ignored: true,
  })
  supplier_id: number;

  @ManyToOne(() => Supplier, (supplier) => supplier.invoices, { nullable: false })
  @JoinColumn({ name: 'supplier_id' })
  @BusinessColumn({
    label: 'Fournisseur',
    description: 'Fournisseur émetteur de la facture',
    importance: 'high',
    group: 'relation',
  })
  supplier: Supplier;

  @Column({ type: 'varchar', length: 100, name: 'invoice_number' })
  @BusinessColumn({
    label: 'N° facture fournisseur',
    description: 'Numéro de facture émis par le fournisseur',
    example: 'FAC-2026-0452',
    importance: 'high',
    group: 'identification',
  })
  invoice_number: string;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Objet',
    description: 'Description de la facture',
    example: 'Abonnement internet fibre - Mars 2026',
    importance: 'medium',
    group: 'identification',
  })
  description: string;

  @Column({ type: 'date', name: 'invoice_date' })
  @BusinessColumn({
    label: 'Date de facture',
    description: 'Date d\'émission de la facture',
    format: 'date',
    example: '2026-03-15',
    importance: 'high',
    group: 'dates',
  })
  invoice_date: Date;

  @Column({ type: 'date', name: 'due_date' })
  @BusinessColumn({
    label: 'Date d\'échéance',
    description: 'Date limite de paiement',
    format: 'date',
    example: '2026-04-15',
    importance: 'high',
    group: 'dates',
  })
  due_date: Date;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'amount_ht' })
  @BusinessColumn({
    label: 'Montant HT',
    description: 'Montant hors taxes',
    unit: '€',
    example: '150.00',
    importance: 'high',
    group: 'financier',
  })
  amount_ht: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0, name: 'tax_rate' })
  @BusinessColumn({
    label: 'Taux TVA',
    description: 'Taux de TVA appliqué',
    unit: '%',
    example: '20.00',
    importance: 'medium',
    group: 'fiscal',
  })
  tax_rate: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'amount_tva' })
  @BusinessColumn({
    label: 'Montant TVA',
    description: 'Montant de la TVA',
    unit: '€',
    example: '30.00',
    importance: 'medium',
    group: 'fiscal',
  })
  amount_tva: number;

  @Column({ type: 'decimal', precision: 10, scale: 2, name: 'amount_ttc' })
  @BusinessColumn({
    label: 'Montant TTC',
    description: 'Montant total TTC',
    unit: '€',
    example: '180.00',
    importance: 'high',
    group: 'financier',
  })
  amount_ttc: number;

  @Column({ type: 'enum', enum: SupplierInvoiceStatus, default: SupplierInvoiceStatus.RECEIVED })
  @BusinessColumn({
    label: 'Statut',
    description: 'Reçue, approuvée, payée, annulée, contestée',
    importance: 'high',
    group: 'statut',
  })
  status: SupplierInvoiceStatus;

  @Column({ type: 'date', nullable: true, name: 'payment_date' })
  @BusinessColumn({
    label: 'Date de paiement',
    description: 'Date effective du paiement',
    format: 'date',
    importance: 'medium',
    group: 'dates',
  })
  payment_date: Date;

  @Column({ type: 'enum', enum: PaymentMethod, nullable: true, name: 'payment_method' })
  @BusinessColumn({
    label: 'Mode de paiement',
    description: 'Espèces, chèque, virement, carte bancaire, prélèvement, mobile money',
    importance: 'medium',
    group: 'financier',
  })
  payment_method: PaymentMethod;

  @Column({ type: 'varchar', length: 500, nullable: true, name: 'attachment_url' })
  @BusinessColumn({
    label: 'Pièce jointe',
    description: 'Lien vers la facture scannée',
    importance: 'medium',
    group: 'document',
  })
  attachment_url: string;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Notes',
    description: 'Commentaires internes',
    importance: 'low',
    group: 'audit',
  })
  notes: string;

  @Column({ type: 'int', nullable: true, name: 'branch_id' })
  @BusinessColumn({
    label: 'Agence',
    description: 'Identifiant de l\'agence concernée',
    importance: 'medium',
    group: 'relation',
    ignored: true,
  })
  branch_id: number;

  @ManyToOne(() => Branch, { nullable: true })
  @JoinColumn({ name: 'branch_id' })
  @BusinessColumn({
    label: 'Agence',
    description: 'Agence concernée par cette dépense',
    importance: 'medium',
    group: 'relation',
  })
  branch: Branch;

  @Column({ type: 'int', nullable: true, name: 'created_by_id' })
  @BusinessColumn({
    label: 'Créé par',
    description: 'Utilisateur ayant créé l\'enregistrement',
    importance: 'low',
    group: 'audit',
    ignored: true,
  })
  created_by_id: number;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by_id' })
  @BusinessColumn({
    label: 'Créé par',
    description: 'Utilisateur ayant saisi la facture',
    importance: 'low',
    group: 'audit',
  })
  created_by: User;

  @CreateDateColumn({ name: 'created_at' })
  @BusinessColumn({
    label: 'Date de création',
    description: 'Date de création dans le système',
    format: 'date',
    importance: 'low',
    group: 'audit',
    ignored: true,
  })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  @BusinessColumn({
    label: 'Date de modification',
    description: 'Date de dernière modification',
    format: 'date',
    importance: 'low',
    group: 'audit',
    ignored: true,
  })
  updated_at: Date;
}