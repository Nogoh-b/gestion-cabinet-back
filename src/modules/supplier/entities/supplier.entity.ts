import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    ManyToOne,
    JoinColumn,
    OneToMany,
} from 'typeorm';
import { TenantEntity } from 'src/core/entities/tenant.entity';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';
import { Branch } from 'src/modules/agencies/branch/entities/branch.entity';
import { SupplierInvoice } from './supplier-invoice.entity';

export enum SupplierCategory {
  INTERNET = 'internet',
  ELECTRICITY = 'electricity',
  RENT = 'rent',
  SUPPLIES = 'supplies',
  SOFTWARE = 'software',
  BAILIFF = 'bailiff',
  INSURANCE = 'insurance',
  MAINTENANCE = 'maintenance',
  OTHER = 'other',
}

@Entity('supplier')
@BusinessTable({
  label: 'Fournisseurs',
  description: 'Répertoire des fournisseurs du cabinet (internet, électricité, fournitures, huissiers, logiciels, loyer, etc.).',
  icon: '🏢',
  category: 'tiers',
})
export class Supplier extends TenantEntity {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique du fournisseur',
    importance: 'low',
    group: 'technique',
    ignored: true,
  })
  id: number;

  @Column({ type: 'varchar', length: 50, unique: true, name: 'supplier_code' })
  @BusinessColumn({
    label: 'Code fournisseur',
    description: 'Code unique (format: SUP-XXX)',
    example: 'SUP-001',
    importance: 'high',
    group: 'identification',
  })
  supplier_code: string;

  @Column({ type: 'varchar', length: 255, name: 'company_name' })
  @BusinessColumn({
    label: 'Raison sociale',
    description: 'Nom officiel du fournisseur',
    example: 'Orange Business Services',
    importance: 'high',
    group: 'identification',
  })
  company_name: string;

  @Column({ type: 'varchar', length: 255, nullable: true, name: 'contact_name' })
  @BusinessColumn({
    label: 'Nom du contact',
    description: 'Personne à contacter chez le fournisseur',
    example: 'Jean Dupont',
    importance: 'medium',
    group: 'identification',
  })
  contact_name: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  @BusinessColumn({
    label: 'Email',
    description: 'Adresse email du fournisseur',
    example: 'contact@orange.fr',
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

  @Column({ type: 'varchar', length: 20, nullable: true, name: 'tva_number' })
  @BusinessColumn({
    label: 'N° TVA',
    description: 'Numéro de TVA intracommunautaire',
    example: 'FR12345678901',
    importance: 'medium',
    group: 'fiscal',
  })
  tva_number: string;

  @Column({ type: 'enum', enum: SupplierCategory })
  @BusinessColumn({
    label: 'Catégorie',
    description: "BD: 'internet', 'electricity', 'rent', 'supplies', 'software', 'bailiff', 'insurance', 'maintenance', 'other'.",
    importance: 'high',
    group: 'identification',
  })
  category: SupplierCategory;

  @Column({ type: 'tinyint', default: 1 })
  @BusinessColumn({
    label: 'Actif',
    description: 'BD: 1=Actif, 0=Inactif. En SQL utiliser le nombre.',
    importance: 'medium',
    group: 'statut',
  })
  status: boolean;

  @Column({ type: 'int', nullable: true, name: 'branch_id' })
  @BusinessColumn({
    label: 'Agence concernée',
    description: 'Identifiant de l\'agence',
    importance: 'medium',
    group: 'relation',
    ignored: true,
  })
  branch_id: number;

  @ManyToOne(() => Branch, { nullable: true })
  @JoinColumn({ name: 'branch_id' })
  @BusinessColumn({
    label: 'Agence',
    description: 'Agence liée à ce fournisseur',
    importance: 'medium',
    group: 'relation',
  })
  branch: Branch;

  @OneToMany(() => SupplierInvoice, (invoice) => invoice.supplier)
  invoices: SupplierInvoice[];

}
