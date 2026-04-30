import { BaseEntity } from 'src/core/entities/baseEntity';
import { GenKeys } from 'src/core/shared/utils/generation-keys.util';
import { Branch } from 'src/modules/agencies/branch/entities/branch.entity';
import { DocumentCustomer } from 'src/modules/documents/document-customer/entities/document-customer.entity';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { LocationCity } from 'src/modules/geography/location_city/entities/location_city.entity';
import {
  BeforeInsert,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TypeCustomer } from '../../type-customer/entities/type_customer.entity';
import { CustomerCommunication } from './customer-communication.entity';
import { Facture } from 'src/modules/facture/entities/facture.entity';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';

export enum CustomerStatus {
  ACTIVE = 1,
  INACTIVE = 0,
  DELETED = -1,
  BLOCKED = -2,
  SUSPENDED = -3,
  LOCKED = -4,
}

export enum CustomerCreatedFrom {
  ONLINE = 1,
  AGENCY = 0,
}

@Entity('customer')
@BusinessTable({
  label: 'Clients',
  description: 'Gestion complète des clients du cabinet (particuliers, professionnels, entreprises). Un client peut avoir plusieurs dossiers, factures et documents.',
  icon: '👤',
  category: 'client'
})
export class Customer extends BaseEntity {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique technique',
    importance: 'low',
    group: 'technique',
    ignored: true
  })
  id: number;

  @Column({ name: 'last_name', length: 45, nullable: false })
  @BusinessColumn({
    label: 'Nom',
    description: 'Nom de famille du client (pour les particuliers)',
    example: 'Dupont, Martin, Diop',
    importance: 'critical',
    group: 'identification'
  })
  last_name: string;

  @Column({ name: 'first_name', length: 45, nullable: false })
  @BusinessColumn({
    label: 'Prénom',
    description: 'Prénom du client (pour les particuliers)',
    example: 'Jean, Marie, Mamadou',
    importance: 'critical',
    group: 'identification'
  })
  first_name: string;

  @Column({ name: 'company_name', length: 255, nullable: true })
  @BusinessColumn({
    label: "Nom de l'entreprise",
    description: "Nom de la société (pour les clients professionnels)",
    example: 'SARL Dupont et Fils, SAS Martin Consulting',
    importance: 'critical',
    group: 'identification'
  })
  company_name: string;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Adresse',
    description: 'Adresse postale complète du client',
    importance: 'high',
    group: 'coordonnées'
  })
  address: string;

  @Column({ name: 'postal_code', length: 20, nullable: true })
  @BusinessColumn({
    label: 'Code postal',
    description: 'Code postal de l\'adresse',
    example: '75001, 69000, 13001',
    importance: 'medium',
    group: 'coordonnées'
  })
  postal_code: string;

  @Column({ name: 'country', length: 100, nullable: true, default: 'France' })
  @BusinessColumn({
    label: 'Pays',
    description: 'Pays de résidence du client',
    example: 'France, Belgique, Suisse, Cameroun',
    importance: 'high',
    group: 'coordonnées'
  })
  country: string;

  @Column({ name: 'billing_type', length: 50, nullable: true })
  @BusinessColumn({
    label: 'Type de facturation',
    description: 'forfait, temps_passe, mixte',
    example: 'forfait = Facturation au forfait, temps_passe = Facturation à l\'heure, mixte = Combinaison',
    importance: 'high',
    group: 'financier'
  })
  billing_type: string;

  @Column({ name: 'professional_phone', length: 45, nullable: true })
  @BusinessColumn({
    label: 'Téléphone professionnel',
    description: 'Numéro de téléphone du bureau',
    format: 'phone',
    importance: 'medium',
    group: 'coordonnées'
  })
  professional_phone: string;

  @Column({ name: 'fax', length: 45, nullable: true })
  @BusinessColumn({
    label: 'Fax',
    description: 'Numéro de fax',
    importance: 'low',
    group: 'coordonnées'
  })
  fax: string;

  @Column({ name: 'siret', length: 14, nullable: true, unique: false })
  @BusinessColumn({
    label: 'Numéro SIRET',
    description: "Numéro d'identification de l'entreprise (14 chiffres)",
    example: '12345678901234',
    importance: 'high',
    group: 'identification'
  })
  siret: string;

  @Column({ name: 'tva_number', length: 20, nullable: true, unique: false })
  @BusinessColumn({
    label: 'Numéro de TVA',
    description: "Numéro d'identification à la TVA intracommunautaire",
    example: 'FR12345678901',
    importance: 'medium',
    group: 'identification'
  })
  tva_number: string;

  @Column({ name: 'legal_form', length: 100, nullable: true })
  @BusinessColumn({
    label: 'Forme juridique',
    description: 'Structure légale de l\'entreprise',
    example: 'SARL, SAS, EI, SA, EURL',
    importance: 'medium',
    group: 'identification'
  })
  legal_form: string;

  @Column({ name: 'reference', length: 100, nullable: true })
  @BusinessColumn({
    label: 'Source de référence',
    description: "Comment le client a connu le cabinet",
    example: 'Recommandation, Internet, Pub, Événement',
    importance: 'medium',
    group: 'provenance'
  })
  reference: string;

  @Column({ name: 'public_key', length: 45, nullable: true })
  public_key: string;

  @Column({ name: 'private_key', length: 45, nullable: true })
  private_key: string;

  @Column({ name: 'number_phone_1', length: 45, nullable: true })
  @BusinessColumn({
    label: 'Téléphone principal',
    description: 'Numéro de téléphone principal du client',
    format: 'phone',
    importance: 'high',
    group: 'coordonnées'
  })
  number_phone_1: string;

  @Column({ name: 'number_phone_2', length: 45, nullable: true })
  @BusinessColumn({
    label: 'Téléphone secondaire',
    description: 'Numéro de téléphone secondaire',
    format: 'phone',
    importance: 'medium',
    group: 'coordonnées'
  })
  number_phone_2: string;

  @Column({ length: 45, nullable: true, unique: false })
  @BusinessColumn({
    label: 'Email',
    description: 'Adresse email du client',
    format: 'email',
    importance: 'critical',
    group: 'coordonnées'
  })
  email: string;

  @Column({ nullable: true, default: 0 })
  cote: number;

  @Column({ name: 'customer_code', length: 45, nullable: false, unique: true })
  @BusinessColumn({
    label: 'Code client',
    description: 'Code unique d\'identification du client (format: JUR-TYPE-XXX)',
    example: 'JUR-PART-2025-001, JUR-PRO-2025-045',
    importance: 'critical',
    group: 'identification'
  })
  customer_code: string;

  @Column({ name: 'branch_id', type: 'int', nullable: true })
  branch_id: Date;

  @ManyToOne(() => Branch)
  @JoinColumn({ name: 'branch_id' })
  @BusinessColumn({
    label: 'Agence',
    description: 'Agence de rattachement du client',
    importance: 'medium',
    group: 'rattachement'
  })
  branch: Branch;

  @ManyToOne(() => TypeCustomer, { eager: false })
  @JoinColumn({ name: 'type_customer_id' })
  @BusinessColumn({
    label: 'Type de client',
    description: 'PART = Particulier, PRO = Professionnel, ENT = Entreprise, ASSO = Association',
    importance: 'critical',
    group: 'classification'
  })
  type_customer: TypeCustomer;

  @ManyToOne(() => LocationCity)
  @JoinColumn({ name: 'location_city_id' })
  @BusinessColumn({
    label: 'Ville',
    description: 'Ville de résidence du client',
    importance: 'high',
    group: 'coordonnées'
  })
  location_city: LocationCity;

  @Column({ nullable: true, default: CustomerCreatedFrom.AGENCY })
  @BusinessColumn({
    label: 'Créé depuis',
    description: '1 = En ligne, 0 = En agence',
    importance: 'medium',
    group: 'provenance'
  })
  created_from: CustomerCreatedFrom;

  @Column({ length: 45, nullable: true, unique: false })
  @BusinessColumn({
    label: 'NUI',
    description: "Numéro d'Unique d'Identification (pièce d'identité)",
    example: '123456789012',
    importance: 'high',
    group: 'identification'
  })
  nui: string;

  @Column({ length: 45, nullable: true, unique: false })
  @BusinessColumn({
    label: 'RCCM',
    description: "Registre du Commerce et des Crédits Mobiliers (pour les entreprises)",
    example: 'CM-DLA-2025-00123',
    importance: 'high',
    group: 'identification'
  })
  rccm: string;

  @Column({ nullable: true })
  @BusinessColumn({
    label: 'Date de naissance',
    description: 'Date de naissance du client (pour les particuliers)',
    format: 'date',
    importance: 'high',
    group: 'identification'
  })
  birthday: Date;

  @Column({ nullable: true, default: 1 })
  @BusinessColumn({
    label: 'Statut',
    description: '1=Actif, 0=Inactif, -1=Supprimé, -2=Bloqué, -3=Suspendu, -4=Verrouillé',
    importance: 'critical',
    group: 'état'
  })
  status: CustomerStatus;

  @OneToMany(() => Dossier, (dossier) => dossier.client)
  @BusinessColumn({
    label: 'Dossiers',
    description: 'Liste des dossiers juridiques du client',
    importance: 'high',
    group: 'relation'
  })
  dossiers: Dossier[];

  @OneToMany(() => DocumentCustomer, (document) => document.customer, {
    nullable: true,
  })
  documents: DocumentCustomer[];

  @OneToMany(() => Facture, (facture) => facture.client)
  factures: Facture[];

  @OneToMany(() => CustomerCommunication, (communication) => communication.customer)
  communications: CustomerCommunication[];

  // ==================== GETTERS MÉTIER ====================

  @BusinessColumn({
    label: 'Professionnel',
    description: 'True si le client est un professionnel ou une entreprise',
    importance: 'high',
    group: 'classification'
  })
  get isProfessional(): boolean {
    return this.type_customer?.code === 'PRO' || this.type_customer?.name === 'Professionnel';
  }

  @BusinessColumn({
    label: 'Particulier',
    description: 'True si le client est un particulier',
    importance: 'high',
    group: 'classification'
  })
  get isParticulier(): boolean {
    return this.type_customer?.code === 'PART' || this.type_customer?.name === 'Particulier';
  }

  @BusinessColumn({
    label: 'Nom complet',
    description: 'Nom complet du client (Prénom Nom) ou nom de l\'entreprise',
    example: 'Jean Dupont, SARL Dupont et Fils',
    importance: 'critical',
    group: 'identification'
  })
  get fullName(): string {
    if (this.company_name && this.isProfessional) {
      return this.company_name;
    }
    return `${this.first_name} ${this.last_name}`.trim();
  }

  @BusinessColumn({
    label: 'Adresse complète',
    description: 'Adresse postale complète avec ville',
    importance: 'medium',
    group: 'coordonnées'
  })
  get city_full_address(): string {
    return this.location_city?.full_address ?? '';
  }

  @BusinessColumn({
    label: 'Contact valide',
    description: 'True si le client a au moins un email ou un téléphone',
    importance: 'medium',
    group: 'coordonnées'
  })
  get hasValidContact(): boolean {
    return !!(this.email || this.number_phone_1 || this.professional_phone);
  }

  @BusinessColumn({
    label: 'Nombre de dossiers',
    description: "Nombre total de dossiers du client",
    importance: 'high',
    group: 'statistiques'
  })
  get dossier_count(): number {
    return this.dossiers?.length || 0;
  }

  @BusinessColumn({
    label: 'Dossiers actifs',
    description: "Nombre de dossiers actifs du client",
    importance: 'high',
    group: 'statistiques'
  })
  get active_dossier_count(): number {
    return this.dossiers?.filter(d => d.is_active).length || 0;
  }

  @BusinessColumn({
    label: 'Nombre de factures',
    description: "Nombre total de factures du client",
    importance: 'medium',
    group: 'statistiques'
  })
  get facture_count(): number {
    return this.factures?.length || 0;
  }

  @BusinessColumn({
    label: 'Est actif',
    description: 'True si le client est actif',
    importance: 'high',
    group: 'état'
  })
  get is_active(): boolean {
    return this.status === CustomerStatus.ACTIVE;
  }

  @BusinessColumn({
    label: 'Statut libellé',
    description: 'Libellé lisible du statut',
    importance: 'medium',
    group: 'état'
  })
  get status_label(): string {
    const labels = {
      [CustomerStatus.ACTIVE]: 'Actif',
      [CustomerStatus.INACTIVE]: 'Inactif',
      [CustomerStatus.DELETED]: 'Supprimé',
      [CustomerStatus.BLOCKED]: 'Bloqué',
      [CustomerStatus.SUSPENDED]: 'Suspendu',
      [CustomerStatus.LOCKED]: 'Verrouillé'
    };
    return labels[this.status] || 'Inconnu';
  }

  get typeCustomerId(): number {
    return this.type_customer?.id;
  }

  get locationCityId(): number {
    return this.location_city?.id;
  }

  get full_name(): string {
    return `${this.first_name} ${this.last_name}`;
  }

  // ==================== MÉTHODES MÉTIER ====================

  @BeforeInsert()
  generateKeys() {
    if (!this.public_key && !this.private_key) {
      const { publicKey, privateKey } = GenKeys.generateKeyPair();
      const encryptedPrivateKey = GenKeys.encryptPrivateKey(privateKey);
      this.public_key = 'publicKey';
      this.private_key = 'encryptedPrivateKey';
    }
    this.status = 1;

    if (!this.customer_code) {
      this.customer_code = this.generateCustomerCode();
    }
  }

  private generateCustomerCode(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    const typeCode = this.type_customer?.code || 'CLI';
    return `JUR-${typeCode}-${timestamp}-${random}`.toUpperCase();
  }

  @BeforeInsert()
  beforeCreate() {
    this.status = CustomerStatus.ACTIVE;
  }
}