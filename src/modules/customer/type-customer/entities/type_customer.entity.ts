// type-customer.entity.ts
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';
import { TenantEntity } from 'src/core/entities/tenant.entity';
import { SharedAcrossTenants } from 'src/core/tenant/tenant.decorator';
import { DocumentType } from 'src/modules/documents/document-type/entities/document-type.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToMany,
  JoinTable,
  OneToMany,
} from 'typeorm';

import { Customer } from '../../customer/entities/customer.entity';


@SharedAcrossTenants()
@Entity('type_customer')
@BusinessTable({
  label: "Types de client",
  description: "Catégorisation des clients du cabinet (particulier, entreprise, association, etc.). Définit les caractéristiques et documents requis par type de client.",
  icon: '👥',
  category: 'client'
})
export class TypeCustomer extends TenantEntity {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique du type de client',
    importance: 'low',
    group: 'technique',
    ignored: true
  })
  id: number;

  @Column({ length: 45, nullable: true })
  @BusinessColumn({
    label: 'Nom',
    description: 'Nom du type de client (Particulier, Entreprise, Association, etc.)',
    example: 'Particulier, Entreprise, Association, Collectivité',
    importance: 'critical',
    group: 'identification'
  })
  name: string;

  @Column({ length: 45, nullable: true })
  @BusinessColumn({
    label: 'Code',
    description: 'Code unique identifiant le type de client (format court)',
    example: 'IND, ENT, ASSO, COL',
    importance: 'high',
    group: 'identification'
  })
  code: string;

  @ManyToMany(() => DocumentType)
  @JoinTable({
    name: 'type_customer_document_type',
    joinColumn: { name: 'type_customer_id' },
    inverseJoinColumn: { name: 'document_type_id' },
  })
  @BusinessColumn({
    label: 'Documents requis',
    description: 'Liste des types de documents obligatoires pour ce type de client',
    importance: 'high',
    group: 'documents'
  })
  requiredDocuments: DocumentType[];

  @OneToMany(() => Customer, (c: Customer) => c.type_customer)
  @BusinessColumn({
    label: 'Clients',
    description: 'Liste des clients appartenant à cette catégorie',
    importance: 'medium',
    group: 'relation'
  })
  customers: Customer[];

  @Column({ type: 'tinyint', nullable: true, default: 1 })
  @BusinessColumn({
    label: 'Statut',
    description: '1 = Actif, 0 = Inactif',
    importance: 'high',
    group: 'état'
  })
  status: number;

  // ==================== GETTERS MÉTIER ====================

  @BusinessColumn({
    label: 'Est actif',
    description: 'True si le type de client est actif',
    importance: 'medium',
    group: 'état'
  })
  get is_active(): boolean {
    return this.status === 1;
  }

  @BusinessColumn({
    label: 'Nom complet',
    description: 'Code et nom combinés pour l\'affichage',
    example: 'IND - Particulier',
    importance: 'medium',
    group: 'identification'
  })
  get display_name(): string {
    return `${this.code || ''}${this.code ? ' - ' : ''}${this.name || ''}`;
  }

  @BusinessColumn({
    label: 'Nombre de clients',
    description: 'Nombre total de clients dans cette catégorie',
    importance: 'medium',
    group: 'statistiques'
  })
  get customer_count(): number {
    return this.customers?.length || 0;
  }

  @BusinessColumn({
    label: "Nombre de documents requis",
    description: "Nombre de types de documents obligatoires pour cette catégorie",
    importance: 'low',
    group: 'statistiques'
  })
  get required_documents_count(): number {
    return this.requiredDocuments?.length || 0;
  }

  @BusinessColumn({
    label: 'Statut libellé',
    description: 'Libellé lisible du statut',
    importance: 'medium',
    group: 'état'
  })
  get status_label(): string {
    return this.status === 1 ? 'Actif' : 'Inactif';
  }
}