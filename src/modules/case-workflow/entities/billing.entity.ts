import { TenantEntity } from 'src/core/entities/tenant.entity';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  VersionColumn,
} from 'typeorm';
import { Facture } from 'src/modules/facture/entities/facture.entity';
import {
  BillableItemStatus,
  BillableSourceType,
  BillingCalculationMode,
  BillingMode,
  BillingTrigger,
} from '../case-workflow.enums';
import {
  BusinessColumn,
  BusinessTable,
} from 'src/core/decorators/business-metadata.decorator';

@Entity('dossier_billing_profiles')
@BusinessTable({
  label: 'Profils de facturation des dossiers',
  description: 'Convention d’honoraires, devise, TVA et tarifs applicables à chaque dossier.',
  category: 'finance',
  readOnly: true,
})
@Index('UQ_dossier_billing_profile', ['tenant_id', 'dossier_id'], {
  unique: true,
})
export class DossierBillingProfile extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  @BusinessColumn({ label: 'Identifiant du profil', description: 'UUID technique du profil de facturation.', importance: 'low', group: 'technique' })
  id: string;

  @Column({ name: 'dossier_id', type: 'int' })
  @BusinessColumn({ label: 'Dossier', description: 'Identifiant du dossier auquel ces paramètres tarifaires s’appliquent.', importance: 'critical', group: 'relation' })
  dossier_id: number;

  @Column({ length: 10, default: 'XAF' })
  @BusinessColumn({ label: 'Devise', description: 'Devise utilisée pour la facturation du dossier.', example: 'XAF', importance: 'high', group: 'tarification' })
  currency: string;

  @Column({
    name: 'vat_rate',
    type: 'decimal',
    precision: 6,
    scale: 3,
    default: 0,
  })
  @BusinessColumn({ label: 'Taux de TVA', description: 'Taux de TVA applicable, exprimé en pourcentage.', format: 'percentage', importance: 'high', group: 'tarification' })
  vat_rate: number;

  @Column({ type: 'enum', enum: BillingMode, default: BillingMode.FIXED })
  @BusinessColumn({ label: 'Mode de facturation', description: 'Mode général du dossier : FIXED=forfait, HOURLY=temps passé, PERCENTAGE=pourcentage, MIXED=mixte.', example: 'FIXED', importance: 'critical', group: 'tarification' })
  mode: BillingMode;

  @Column({
    name: 'fixed_fee',
    type: 'decimal',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  @BusinessColumn({ label: 'Forfait', description: 'Montant forfaitaire configuré pour le dossier.', format: 'currency', importance: 'high', group: 'tarification' })
  fixed_fee: number | null;

  @Column({
    name: 'hourly_rate',
    type: 'decimal',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  @BusinessColumn({ label: 'Taux horaire', description: 'Tarif appliqué par heure de travail.', format: 'currency', importance: 'high', group: 'tarification' })
  hourly_rate: number | null;

  @Column({
    name: 'percentage_rate',
    type: 'decimal',
    precision: 8,
    scale: 4,
    nullable: true,
  })
  @BusinessColumn({ label: 'Taux au pourcentage', description: 'Pourcentage appliqué à la base de calcul.', format: 'percentage', importance: 'high', group: 'tarification' })
  percentage_rate: number | null;

  @Column({
    name: 'percentage_base',
    type: 'decimal',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  @BusinessColumn({ label: 'Base du pourcentage', description: 'Montant servant de base au calcul au pourcentage.', format: 'currency', importance: 'high', group: 'tarification' })
  percentage_base: number | null;

  @Column({
    name: 'opening_fee',
    type: 'decimal',
    precision: 14,
    scale: 2,
    nullable: true,
  })
  @BusinessColumn({ label: 'Frais d’ouverture', description: 'Frais facturables à l’ouverture du dossier.', format: 'currency', importance: 'medium', group: 'tarification' })
  opening_fee: number | null;

  @Column({ name: 'is_confirmed', type: 'boolean', default: false })
  @BusinessColumn({ label: 'Tarification confirmée', description: 'Indique si les paramètres de facturation du dossier ont été validés.', importance: 'critical', group: 'état' })
  is_confirmed: boolean;

  @VersionColumn({ name: 'lock_version', type: 'int' })
  @BusinessColumn({ label: 'Version technique', description: 'Compteur de verrouillage optimiste.', importance: 'low', group: 'technique', ignored: true })
  lock_version: number;
}

@Entity('dossier_billing_rules')
@BusinessTable({
  label: 'Règles tarifaires des dossiers',
  description: 'Règles actives déterminant le tarif d’une action, d’une audience ou d’une diligence dans un dossier.',
  category: 'finance',
  readOnly: true,
})
@Index(
  'UQ_dossier_billing_rule_version',
  ['tenant_id', 'dossier_id', 'code', 'version'],
  { unique: true },
)
export class DossierBillingRule extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  @BusinessColumn({ label: 'Identifiant de la règle', description: 'UUID technique de cette version de règle.', importance: 'low', group: 'technique' })
  id: string;

  @Column({ name: 'dossier_id', type: 'int' })
  @BusinessColumn({ label: 'Dossier', description: 'Identifiant du dossier auquel la règle s’applique.', importance: 'critical', group: 'relation' })
  dossier_id: number;

  @Column({ length: 100 })
  @BusinessColumn({ label: 'Code de la règle', description: 'Code métier stable partagé par les versions de la règle.', example: 'SIGN_DOCUMENT_FEE', importance: 'high', group: 'identification' })
  code: string;

  @Column({ type: 'int', default: 1 })
  @BusinessColumn({ label: 'Version', description: 'Version de la règle tarifaire.', importance: 'medium', group: 'identification' })
  version: number;

  @Column({ type: 'enum', enum: BillingTrigger })
  @BusinessColumn({ label: 'Déclencheur', description: 'Évènement déclenchant le calcul : notamment ACTION_COMPLETED pour une action terminée.', example: 'ACTION_COMPLETED', importance: 'critical', group: 'application' })
  trigger: BillingTrigger;

  @Column({
    name: 'calculation_mode',
    type: 'enum',
    enum: BillingCalculationMode,
  })
  @BusinessColumn({ label: 'Mode de calcul', description: 'Mode appliqué : FIXED, HOURLY, PERCENTAGE ou EXPENSE.', example: 'FIXED', importance: 'critical', group: 'tarification' })
  calculation_mode: BillingCalculationMode;

  @Column({ type: 'decimal', precision: 14, scale: 2, nullable: true })
  @BusinessColumn({ label: 'Tarif', description: 'Montant ou taux configuré par la règle.', format: 'currency', importance: 'critical', group: 'tarification' })
  rate: number | null;

  @Column({ name: 'base_field', type: 'varchar', length: 120, nullable: true })
  @BusinessColumn({ label: 'Champ de base', description: 'Chemin du champ utilisé comme base pour un calcul variable.', importance: 'medium', group: 'tarification' })
  base_field: string | null;

  @Column({
    name: 'action_definition_code',
    type: 'varchar',
    length: 100,
    nullable: true,
  })
  @BusinessColumn({ label: 'Code d’action ciblé', description: 'Code de définition d’action ciblé. Null signifie que la règle s’applique à toutes les actions du dossier pour ce déclencheur.', example: 'SIGN_DOCUMENT', importance: 'critical', group: 'application' })
  action_definition_code: string | null;

  @Column({ name: 'fee_type', length: 120 })
  @BusinessColumn({ label: 'Type d’honoraires', description: 'Libellé comptable ou commercial du tarif.', example: 'Honoraires de formalité', importance: 'high', group: 'tarification' })
  fee_type: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  @BusinessColumn({ label: 'Règle active', description: 'Seules les règles actives doivent être considérées.', importance: 'critical', group: 'état' })
  is_active: boolean;

  @VersionColumn({ name: 'lock_version', type: 'int' })
  @BusinessColumn({ label: 'Version technique', description: 'Compteur de verrouillage optimiste.', importance: 'low', group: 'technique', ignored: true })
  lock_version: number;
}

@Entity('billable_items')
@BusinessTable({
  label: 'Éléments facturables',
  description: 'Travaux, honoraires et frais à contrôler, facturer, ajuster ou abandonner.',
  category: 'finance',
  readOnly: true,
})
@Index('UQ_billable_item_source_event', ['tenant_id', 'source_event_key'], {
  unique: true,
})
@Index('IDX_billable_item_selection', [
  'tenant_id',
  'dossier_id',
  'status',
  'occurred_at',
])
export class BillableItem extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  @BusinessColumn({ label: 'Identifiant de l’élément', description: 'UUID technique de l’élément facturable.', importance: 'low', group: 'technique' })
  id: string;

  @Column({ name: 'dossier_id', type: 'int' })
  @BusinessColumn({ label: 'Dossier', description: 'Identifiant du dossier concerné.', importance: 'critical', group: 'relation' })
  dossier_id: number;

  @Column({ name: 'client_id', type: 'int' })
  @BusinessColumn({ label: 'Client', description: 'Identifiant du client à facturer.', importance: 'high', group: 'relation' })
  client_id: number;

  @Column({ name: 'source_type', type: 'enum', enum: BillableSourceType })
  @BusinessColumn({ label: 'Type de source', description: 'Origine : ACTION, AUDIENCE, DILIGENCE, OPENING_FEE, MANUAL ou ADJUSTMENT. Pour les actions, filtrer ACTION.', example: 'ACTION', importance: 'critical', group: 'origine' })
  source_type: BillableSourceType;

  @Column({ name: 'source_id', type: 'varchar', length: 80 })
  @BusinessColumn({ label: 'Source', description: 'Identifiant de l’objet source. Lorsque source_type=ACTION, correspond à dossier_actions.id.', importance: 'critical', group: 'relation' })
  source_id: string;

  @Column({ name: 'source_event_key', length: 180 })
  @BusinessColumn({ label: 'Clé de l’évènement source', description: 'Clé technique garantissant l’unicité de la génération.', importance: 'low', group: 'technique', ignored: true })
  source_event_key: string;

  @Column({ type: 'datetime', name: 'occurred_at' })
  @BusinessColumn({ label: 'Date de réalisation', description: 'Date de l’évènement ayant généré l’élément.', format: 'date', importance: 'high', group: 'facturation' })
  occurred_at: Date;

  @Column({ length: 255 })
  @BusinessColumn({ label: 'Libellé à facturer', description: 'Libellé destiné à la ligne de facture.', example: 'Faire signer le document', importance: 'critical', group: 'facturation' })
  label: string;

  @Column({ type: 'decimal', precision: 14, scale: 4, default: 1 })
  @BusinessColumn({ label: 'Quantité', description: 'Quantité facturable calculée.', importance: 'high', group: 'montants' })
  quantity: number;

  @Column({
    name: 'unit_price',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  @BusinessColumn({ label: 'Prix unitaire', description: 'Prix unitaire hors taxe.', format: 'currency', importance: 'critical', group: 'montants' })
  unit_price: number;

  @Column({
    name: 'net_amount',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  @BusinessColumn({ label: 'Montant HT', description: 'Montant net hors taxe.', format: 'currency', importance: 'critical', group: 'montants' })
  net_amount: number;

  @Column({
    name: 'tax_rate',
    type: 'decimal',
    precision: 6,
    scale: 3,
    default: 0,
  })
  @BusinessColumn({ label: 'Taux de taxe', description: 'Taux de TVA appliqué.', format: 'percentage', importance: 'high', group: 'montants' })
  tax_rate: number;

  @Column({
    name: 'tax_amount',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  @BusinessColumn({ label: 'Montant de taxe', description: 'Montant de TVA calculé.', format: 'currency', importance: 'high', group: 'montants' })
  tax_amount: number;

  @Column({
    name: 'gross_amount',
    type: 'decimal',
    precision: 14,
    scale: 2,
    default: 0,
  })
  @BusinessColumn({ label: 'Montant TTC', description: 'Montant total toutes taxes comprises.', format: 'currency', importance: 'critical', group: 'montants' })
  gross_amount: number;

  @Column({ length: 10, default: 'XAF' })
  @BusinessColumn({ label: 'Devise', description: 'Devise des montants.', example: 'XAF', importance: 'high', group: 'montants' })
  currency: string;

  @Column({
    type: 'enum',
    enum: BillableItemStatus,
    default: BillableItemStatus.TO_INVOICE,
  })
  @BusinessColumn({ label: 'État de facturation', description: 'NEEDS_REVIEW=tarif à vérifier, TO_INVOICE=prêt à facturer, RESERVED=réservé par une facture en préparation, INVOICED=déjà facturé, WAIVED=abandonné, ADJUSTED=ajusté. Seul TO_INVOICE signifie « prêt à facturer ».', example: 'TO_INVOICE', importance: 'critical', group: 'état' })
  status: BillableItemStatus;

  @Column({ name: 'calculation_snapshot', type: 'json' })
  @BusinessColumn({ label: 'Détail du calcul', description: 'Instantané de la règle, du tarif et des paramètres ayant produit les montants.', importance: 'medium', group: 'calcul' })
  calculation_snapshot: Record<string, unknown>;

  @Column({ name: 'review_reason', type: 'text', nullable: true })
  @BusinessColumn({ label: 'Motif de vérification', description: 'Raison pour laquelle le tarif ou le calcul doit être contrôlé. Renseigné notamment quand status=NEEDS_REVIEW.', importance: 'critical', group: 'état' })
  review_reason: string | null;

  @Column({ name: 'reserved_at', type: 'datetime', nullable: true })
  @BusinessColumn({ label: 'Réservé le', description: 'Date de réservation dans une facture en préparation.', format: 'date', importance: 'medium', group: 'état' })
  reserved_at: Date | null;

  @Column({
    name: 'invoice_line_id',
    type: 'varchar',
    length: 36,
    nullable: true,
  })
  @BusinessColumn({ label: 'Ligne de facture', description: 'Identifiant de la ligne créée lorsque l’élément a été facturé.', importance: 'high', group: 'relation' })
  invoice_line_id: string | null;

  @VersionColumn({ name: 'lock_version', type: 'int' })
  @BusinessColumn({ label: 'Version technique', description: 'Compteur de verrouillage optimiste.', importance: 'low', group: 'technique', ignored: true })
  lock_version: number;
}

@Entity('invoice_lines')
@BusinessTable({
  label: 'Lignes de facture',
  description: 'Lignes de facture créées à partir des éléments facturables des dossiers.',
  category: 'finance',
  readOnly: true,
})
@Index('UQ_invoice_line_billable_item', ['tenant_id', 'billable_item_id'], {
  unique: true,
})
export class InvoiceLine extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  @BusinessColumn({ label: 'Identifiant de la ligne', description: 'UUID technique de la ligne de facture.', importance: 'low', group: 'technique' })
  id: string;

  // Note : pas de `length` ici — TypeORM aligne le type de la colonne FK sur la
  // PK réferencée (uuid) et MariaDB >= 10.7 refuse `length` sur uuid.
  // Le DDL réel (varchar(36)) est porté par la migration SQL.
  @Column({ name: 'facture_id', type: 'varchar' })
  @BusinessColumn({ label: 'Facture', description: 'Identifiant de la facture contenant cette ligne.', importance: 'critical', group: 'relation' })
  facture_id: string;

  @ManyToOne(() => Facture, (facture) => facture.lines, {
    onDelete: 'RESTRICT',
  })
  @JoinColumn({ name: 'facture_id' })
  facture: Facture;

  @Column({ name: 'dossier_id', type: 'int' })
  @BusinessColumn({ label: 'Dossier', description: 'Identifiant du dossier concerné par la ligne.', importance: 'high', group: 'relation' })
  dossier_id: number;

  @Column({ name: 'billable_item_id', type: 'varchar', length: 36 })
  @BusinessColumn({ label: 'Élément facturable', description: 'Identifiant de l’élément facturable à l’origine de la ligne.', importance: 'critical', group: 'relation' })
  billable_item_id: string;

  @Column({ name: 'display_order', type: 'int', default: 0 })
  @BusinessColumn({ label: 'Ordre', description: 'Position de la ligne dans la facture.', importance: 'low', group: 'affichage' })
  display_order: number;

  @Column({ length: 255 })
  @BusinessColumn({ label: 'Libellé', description: 'Description commerciale de la prestation facturée.', importance: 'critical', group: 'facturation' })
  label: string;

  @Column({ type: 'decimal', precision: 14, scale: 4 })
  @BusinessColumn({ label: 'Quantité', description: 'Quantité facturée.', importance: 'high', group: 'montants' })
  quantity: number;

  @Column({ name: 'unit_price', type: 'decimal', precision: 14, scale: 2 })
  @BusinessColumn({ label: 'Prix unitaire', description: 'Prix unitaire hors taxe.', format: 'currency', importance: 'high', group: 'montants' })
  unit_price: number;

  @Column({ name: 'net_amount', type: 'decimal', precision: 14, scale: 2 })
  @BusinessColumn({ label: 'Montant HT', description: 'Montant total hors taxe de la ligne.', format: 'currency', importance: 'critical', group: 'montants' })
  net_amount: number;

  @Column({ name: 'tax_rate', type: 'decimal', precision: 6, scale: 3 })
  @BusinessColumn({ label: 'Taux de taxe', description: 'Taux de TVA appliqué.', format: 'percentage', importance: 'high', group: 'montants' })
  tax_rate: number;

  @Column({ name: 'tax_amount', type: 'decimal', precision: 14, scale: 2 })
  @BusinessColumn({ label: 'Montant de taxe', description: 'Montant de TVA de la ligne.', format: 'currency', importance: 'high', group: 'montants' })
  tax_amount: number;

  @Column({ name: 'gross_amount', type: 'decimal', precision: 14, scale: 2 })
  @BusinessColumn({ label: 'Montant TTC', description: 'Montant total toutes taxes comprises.', format: 'currency', importance: 'critical', group: 'montants' })
  gross_amount: number;

  @Column({ length: 10 })
  @BusinessColumn({ label: 'Devise', description: 'Devise de la ligne de facture.', example: 'XAF', importance: 'high', group: 'montants' })
  currency: string;

  @Column({ name: 'source_snapshot', type: 'json' })
  @BusinessColumn({ label: 'Instantané de la source', description: 'Copie des informations d’origine au moment de la facturation.', importance: 'medium', group: 'audit' })
  source_snapshot: Record<string, unknown>;
}
