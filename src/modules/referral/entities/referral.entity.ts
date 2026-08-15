import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';
import { TenantEntity } from 'src/core/entities/tenant.entity';
import { Employee } from 'src/modules/agencies/employee/entities/employee.entity';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { DossierReferral } from './dossier-referral.entity';

export enum ReferrerType {
  LAWYER = 'lawyer',
  ACCOUNTANT = 'accountant',
  AGENCY = 'agency',
  CLIENT = 'client',
  EMPLOYEE = 'employee',
  INDIVIDUAL = 'individual',
  OTHER = 'other',
}

export enum ReferrerPaymentMethod {
  VIREMENT = 'VIREMENT',
  CHEQUE = 'CHEQUE',
  ESPECES = 'ESPECES',
  MOBILE_MONEY = 'MOBILE_MONEY',
}

@Entity('referrer')
@BusinessTable({
  label: 'Apporteurs d\'affaires',
  description:
    'Personnes physiques ou morales qui apportent des clients/dossiers au cabinet. Peut être externe (confrère, expert-comptable, agence) ou interne (employé du cabinet).',
  icon: '🤝',
  category: 'tiers',
})
export class Referrer extends TenantEntity {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique de l\'apporteur',
    importance: 'low',
    group: 'technique',
    ignored: true,
  })
  id: number;

  @Column({ type: 'varchar', length: 50, unique: true, name: 'referrer_code' })
  @BusinessColumn({
    label: 'Code apporteur',
    description: 'Code unique (format: REF-XXX)',
    example: 'REF-001',
    importance: 'high',
    group: 'identification',
  })
  referrer_code: string;

  @Column({ type: 'enum', enum: ReferrerType, name: 'referrer_type' })
  @BusinessColumn({
    label: 'Type d\'apporteur',
    description: "BD: 'lawyer'=Confrère, 'accountant'=Expert-comptable, 'agency'=Agence, 'client', 'employee', 'individual', 'other'.",
    importance: 'high',
    group: 'identification',
  })
  referrer_type: ReferrerType;

  @Column({ type: 'tinyint', default: 0, name: 'is_internal' })
  @BusinessColumn({
    label: 'Est interne',
    description: '1 = employé du cabinet, 0 = externe',
    importance: 'medium',
    group: 'identification',
  })
  is_internal: boolean;

  @Column({ type: 'int', nullable: true, name: 'employee_id' })
  @BusinessColumn({
    label: 'Employé (si interne)',
    description: 'Identifiant du collaborateur si l\'apporteur est interne',
    importance: 'medium',
    group: 'relation',
    ignored: true,
  })
  employee_id: number;

  @ManyToOne(() => Employee, { nullable: true })
  @JoinColumn({ name: 'employee_id' })
  @BusinessColumn({
    label: 'Employé',
    description: 'Collaborateur associé (apporteur interne)',
    importance: 'medium',
    group: 'relation',
  })
  employee: Employee | null;  // Ajouter | null

  @Column({ type: 'int', nullable: true, name: 'customer_id' })
  @BusinessColumn({
    label: 'Client (si apporteur)',
    description: 'Identifiant du client s\'il est lui-même apporteur',
    importance: 'low',
    group: 'relation',
    ignored: true,
  })
  customer_id: number;

  @ManyToOne(() => Customer, { nullable: true })
  @JoinColumn({ name: 'customer_id' })
  @BusinessColumn({
    label: 'Client',
    description: 'Client existant agissant comme apporteur',
    importance: 'low',
    group: 'relation',
  })
  customer: Customer | null;  // Ajouter | null

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'company_name' })
  @BusinessColumn({
    label: 'Raison sociale / Nom',
    description: 'Nom de l\'entreprise ou nom complet',
    example: 'Cabinet Dupont & Associés',
    importance: 'high',
    group: 'identification',
  })
  company_name: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'contact_name' })
  @BusinessColumn({
    label: 'Nom du contact',
    description: 'Personne à contacter',
    example: 'Jean Martin',
    importance: 'high',
    group: 'identification',
  })
  contact_name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  @BusinessColumn({
    label: 'Email',
    description: 'Adresse email de l\'apporteur',
    example: 'contact@cabinet-dupont.fr',
    importance: 'high',
    group: 'contact',
  })
  email: string;

  @Column({ type: 'varchar', length: 45, nullable: true })
  @BusinessColumn({
    label: 'Téléphone',
    description: 'Numéro de téléphone',
    example: '+33 1 23 45 67 89',
    importance: 'medium',
    group: 'contact',
  })
  phone: string;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Adresse',
    description: 'Adresse postale complète',
    importance: 'low',
    group: 'contact',
  })
  address: string;

  @Column({ type: 'decimal', precision: 5, scale: 2, nullable: true, name: 'default_commission_rate' })
  @BusinessColumn({
    label: 'Taux de commission par défaut (%)',
    description: 'Pourcentage appliqué par défaut aux dossiers apportés',
    example: '10.0',
    unit: '%',
    importance: 'high',
    group: 'financier',
  })
  default_commission_rate: number;

  @Column({ type: 'enum', enum: ReferrerPaymentMethod, nullable: true, name: 'payment_method' })
  @BusinessColumn({
    label: 'Mode de paiement privilégié',
    description: "BD: 'VIREMENT', 'CHEQUE', 'ESPECES', 'MOBILE_MONEY'.",
    importance: 'medium',
    group: 'financier',
  })
  payment_method: ReferrerPaymentMethod;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'bank_name' })
  @BusinessColumn({
    label: 'Banque',
    description: 'Nom de la banque',
    importance: 'low',
    group: 'bancaire',
  })
  bank_name: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'bank_account_holder' })
  @BusinessColumn({
    label: 'Titulaire du compte',
    description: 'Nom du titulaire du compte bancaire',
    importance: 'low',
    group: 'bancaire',
  })
  bank_account_holder: string;

  @Column({ type: 'varchar', length: 100, nullable: true, name: 'bank_iban' })
  @BusinessColumn({
    label: 'IBAN',
    description: 'IBAN du compte bancaire',
    importance: 'low',
    group: 'bancaire',
  })
  bank_iban: string;

  @Column({ type: 'tinyint', default: 1 })
  @BusinessColumn({
    label: 'Actif',
    description: 'BD: 1=Actif, 0=Inactif. En SQL utiliser le nombre.',
    importance: 'medium',
    group: 'statut',
  })
  status: boolean;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Notes',
    description: 'Notes internes',
    importance: 'low',
    group: 'audit',
  })
  notes: string;

  @OneToMany(() => DossierReferral, (referral) => referral.referrer)
  dossier_referrals: DossierReferral[];

}
