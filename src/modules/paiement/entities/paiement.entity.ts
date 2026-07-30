// paiement.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { Facture } from '../../facture/entities/facture.entity';
import { ModePaiement, StatutPaiement } from '../dto/create-paiement.dto';
import {
  BusinessTable,
  BusinessColumn,
} from 'src/core/decorators/business-metadata.decorator';
import { TenantEntity } from 'src/core/entities/tenant.entity';

@Entity('paiements')
@BusinessTable({
  label: 'Paiements',
  description:
    'Enregistrement des paiements reçus des clients pour les factures. Les colonnes enum numériques modePaiement et status se filtrent avec leurs codes BD.',
  icon: '💳',
  category: 'finance',
})
export class Paiement extends TenantEntity {
  /** Transient — lu par le PaiementSubscriber pour notifier le client. */
  notify_client?: boolean;

  @Column({ name: 'notify_client_requested', default: false })
  notifyClientRequested: boolean;

  @PrimaryGeneratedColumn('uuid')
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique du paiement',
    importance: 'low',
    group: 'technique',
    ignored: true,
  })
  id: string;

  @Column({ name: 'facture_id' })
  @BusinessColumn({
    label: 'Facture',
    description: 'Identifiant de la facture associée',
    importance: 'critical',
    group: 'relation',
    ignored: true,
  })
  factureId: string;

  @Column({ type: 'decimal', precision: 18, scale: 2 })
  @BusinessColumn({
    label: 'Montant',
    description: 'Montant payé',
    unit: '€',
    format: 'currency',
    importance: 'critical',
    group: 'financier',
  })
  montant: number;

  @Column({
    type: 'enum',
    enum: ModePaiement,
    default: ModePaiement.ESPECES,
  })
  @BusinessColumn({
    label: 'Mode de paiement',
    description:
      'BD: 0=VIREMENT, 1=CHEQUE, 2=ESPECES, 3=CARTE, 4=PRELEVEMENT, 5=Mobile, 6=AUTRE. En SQL utiliser le nombre.',
    example: 'modePaiement = 0 pour virement, 2 pour espèces',
    importance: 'high',
    group: 'paiement',
  })
  modePaiement: ModePaiement;

  @Column({ name: 'date_paiement', type: 'date' })
  @BusinessColumn({
    label: 'Date de paiement',
    description: 'Date à laquelle le paiement a été effectué',
    format: 'date',
    importance: 'high',
    group: 'dates',
  })
  datePaiement: Date;

  @Column({ name: 'date_valeur', type: 'date' })
  @BusinessColumn({
    label: 'Date de valeur',
    description: 'Date de valeur bancaire',
    format: 'date',
    importance: 'medium',
    group: 'dates',
  })
  dateValeur: Date;

  @Column({ nullable: true })
  @BusinessColumn({
    label: 'Référence',
    description:
      'Référence du paiement (numéro de transaction, virement, etc.)',
    importance: 'medium',
    group: 'identification',
  })
  reference: string;

  @Column({ name: 'numero_cheque', nullable: true })
  @BusinessColumn({
    label: 'Numéro de chèque',
    description: 'Numéro du chèque (si paiement par chèque)',
    importance: 'medium',
    group: 'identification',
  })
  numeroCheque: string;

  @Column({ nullable: true })
  @BusinessColumn({
    label: 'Banque',
    description: 'Banque émettrice (chèque ou virement)',
    importance: 'medium',
    group: 'coordonnées',
  })
  banque: string;

  @Column({ nullable: true })
  @BusinessColumn({
    label: 'Titulaire',
    description: 'Nom du titulaire du compte/chèque',
    importance: 'medium',
    group: 'identification',
  })
  titulaire: string;

  @Column({
    type: 'enum',
    enum: StatutPaiement,
    // Un paiement est considéré comme validé par défaut (cf. demande métier) :
    // tout paiement enregistré l'est après vérification, donc VALIDE d'office.
    default: StatutPaiement.EN_ATTENTE,
  })
  @BusinessColumn({
    label: 'Statut',
    description:
      'BD: 0=EN_ATTENTE, 1=VALIDE, 2=REJETE, 3=ANNULE. En SQL utiliser le nombre.',
    example: 'status = 1 pour un paiement validé',
    importance: 'critical',
    group: 'état',
  })
  status: StatutPaiement;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Notes',
    description: 'Commentaires internes sur le paiement',
    importance: 'low',
    group: 'interne',
  })
  notes: string;

  @Column({ name: 'preuve_paiement', nullable: true })
  @BusinessColumn({
    label: 'Preuve de paiement',
    description: 'Chemin du fichier justificatif',
    importance: 'low',
    group: 'document',
    ignored: true,
  })
  preuvePaiement: string;

  @Column({
    name: 'preuve_original_name',
    type: 'varchar',
    nullable: true,
    length: 255,
  })
  preuveOriginalName: string | null;

  @Column({
    name: 'preuve_mime_type',
    type: 'varchar',
    nullable: true,
    length: 120,
  })
  preuveMimeType: string | null;

  @Column({ name: 'preuve_size', type: 'bigint', nullable: true })
  preuveSize: string | null;

  @Column({
    name: 'preuve_sha256',
    type: 'char',
    nullable: true,
    length: 64,
  })
  preuveSha256: string | null;

  // created_at, updated_at, deleted_at, tenant_id hérités de TenantEntity

  @ManyToOne(() => Facture, (facture) => facture.paiements)
  @JoinColumn({ name: 'facture_id' })
  @BusinessColumn({
    label: 'Facture',
    description: 'Facture associée à ce paiement',
    importance: 'critical',
    group: 'relation',
  })
  facture: Facture;
}
