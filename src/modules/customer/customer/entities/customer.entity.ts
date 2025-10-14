import { BaseEntity } from 'src/core/entities/baseEntity';
import { GenKeys } from 'src/core/shared/utils/generation-keys.util';
import { Branch } from 'src/modules/agencies/branch/entities/branch.entity';
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
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { DocumentCustomer } from 'src/modules/documents/document-customer/entities/document-customer.entity';
import { Facture } from 'src/modules/finances/entities/facture.entity';
// import { Dossier } from 'src/modules/dossiers/entities/dossier.entity'; // ✅ Ajout

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
export class Customer extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'last_name', length: 45, nullable: false })
  last_name: string;

  @Column({ name: 'first_name', length: 45, nullable: false })
  first_name: string;

  // ✅ AJOUTS pour correspondre aux specs juridiques
  @Column({ name: 'company_name', length: 255, nullable: true })
  company_name: string;

  @Column({ type: 'text', nullable: true })
  address: string;

  @Column({ name: 'postal_code', length: 20, nullable: true })
  postal_code: string;

  @Column({ name: 'country', length: 100, nullable: true, default: 'France' })
  country: string;

  // ✅ Type de facturation par client
  @Column({ name: 'billing_type', length: 50, nullable: true })
  billing_type: string; // 'forfait', 'temps_passe', 'mixte'

  // ✅ Informations de contact supplémentaires
  @Column({ name: 'professional_phone', length: 45, nullable: true })
  professional_phone: string;

  @Column({ name: 'fax', length: 45, nullable: true })
  fax: string;

  // ✅ Informations juridiques (pour professionnels)
  @Column({ name: 'siret', length: 14, nullable: true, unique: false })
  siret: string;

  @Column({ name: 'tva_number', length: 20, nullable: true, unique: false })
  tva_number: string;

  @Column({ name: 'legal_form', length: 100, nullable: true })
  legal_form: string; // SARL, SAS, EI, etc.

  // ✅ Référencement client
  @Column({ name: 'reference', length: 100, nullable: true })
  reference: string; // Comment le client a connu le cabinet

  // -- CHAMPS EXISTANTS À CONSERVER --
  @Column({ name: 'public_key', length: 45, nullable: true })
  public_key: string;

  @Column({ name: 'private_key', length: 45, nullable: true })
  private_key: string;

  @Column({ name: 'number_phone_1', length: 45, nullable: true })
  number_phone_1: string;

  @Column({ name: 'number_phone_2', length: 45, nullable: true })
  number_phone_2: string;

  @Column({ length: 45, nullable: true, unique: false })
  email: string;

  @Column({ nullable: true, default: 0 })
  cote: number;

  @Column({ name: 'customer_code', length: 45, nullable: false, unique: true })
  customer_code: string;

  @ManyToOne(() => Branch)
  @JoinColumn({ name: 'branch_id' })
  branch: Branch;

  // ✅ TypeCustomer gère maintenant le segment
  @ManyToOne(() => TypeCustomer, { eager: true }) // eager loading pour accès facile
  @JoinColumn({ name: 'type_customer_id' })
  type_customer: TypeCustomer;

  @ManyToOne(() => LocationCity)
  @JoinColumn({ name: 'location_city_id' })
  location_city: LocationCity;

  @Column({ nullable: true, default: CustomerCreatedFrom.AGENCY })
  created_from: CustomerCreatedFrom;

  @Column({ length: 45, nullable: true, unique: false })
  nui: string;

  @Column({ length: 45, nullable: true, unique: false })
  rccm: string;

  @Column({ nullable: true })
  birthday: Date;

  @Column({ nullable: true, default: 1 })
  status: CustomerStatus;

  // ✅ Relation avec les dossiers juridiques
  @OneToMany(() => Dossier, (dossier) => dossier.client)
  dossiers: Dossier[];

  @OneToMany(() => DocumentCustomer, (document) => document.customer)
  documents: DocumentCustomer[];

  @OneToMany(() => Facture, (facture) => facture.client)
  factures: Facture[];

  // ✅ GETTERS améliorés
  get fullName(): string {
    if (this.company_name && this.isProfessional) {  
      return this.company_name;
    }
    return `${this.first_name} ${this.last_name}`.trim(); 
  }

  // ✅ Utilise TypeCustomer pour déterminer le segment
  get isProfessional(): boolean {
    return false;
  }

  get isParticulier(): boolean {
    return  false;
  }

  get hasValidContact(): boolean {
    return !!(this.email || this.number_phone_1 || this.professional_phone);
  }

  // ✅ Génération des clés
  @BeforeInsert()
  generateKeys() {
    if (!this.public_key && !this.private_key) {
      const { publicKey, privateKey } = GenKeys.generateKeyPair();
      const encryptedPrivateKey = GenKeys.encryptPrivateKey(privateKey);
      this.public_key = 'publicKey';
      this.private_key = 'encryptedPrivateKey';
    }
    
    if (!this.customer_code) {
      this.customer_code = this.generateCustomerCode();
    }
  }

  // ✅ Génération de code client juridique
  private generateCustomerCode(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    const typeCode = this.type_customer?.code || 'CLI';
    return `JUR-${typeCode}-${timestamp}-${random}`.toUpperCase();
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
}