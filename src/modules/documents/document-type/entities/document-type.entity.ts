// src/core/document/entities/document-type.entity.ts
import { BaseEntity } from 'src/core/entities/baseEntity';
import { TypeCustomer } from 'src/modules/customer/type-customer/entities/type_customer.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToMany, JoinTable, OneToMany } from 'typeorm';
import { DocumentCustomer } from '../../document-customer/entities/document-customer.entity';
import { DocumentCategory } from 'src/modules/document-category/entities/document-category.entity';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';

export enum DocumentTypeStatus {
  PENDING = 0,
  ACCEPTED = 1,
  REFUSED = 2,
}

export enum DocumentTypeCode {
  CNI_AVANT = "CNI AVANT",
  CNI_ARRIERE = "CNI ARRIERE",
  SELFIE_AVEC_CNI = "SELFIE AVEC CNI",
  PHOTO_4X4 = "PHOTO 4X4",
  RCCM = "RCCM",
  PL_LOCALISATION = "PL LOCALISATION",
  NIU = "NIU",
  JDR = "JDR",
  SIGNATURE = "SIGNATURE",
  ATTEST_DOMI = "ATTEST DOMI",
  CAUTION = "CAUTION",
}

@Entity('document_type')
@BusinessTable({
  label: 'Types de documents',
  description: 'Référentiel des types de documents utilisés dans le système. Définit les règles (taille max, format, durée de validité) et les catégories associées.',
  icon: '📋',
  category: 'document'
})
export class DocumentType extends BaseEntity {
  @PrimaryGeneratedColumn()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique du type de document',
    importance: 'low',
    group: 'technique',
    ignored: true
  })
  id: number;

  @Column({ length: 100 })
  @BusinessColumn({
    label: 'Code',
    description: 'Code unique identifiant le type de document',
    example: 'CNI_AVANT, CNI_ARRIERE, SELFIE_AVEC_CNI, PHOTO_4X4, RCCM, NIU',
    importance: 'critical',
    group: 'identification'
  })
  code: string;

  @Column({ length: 100 })
  @BusinessColumn({
    label: 'Nom',
    description: 'Nom lisible du type de document',
    example: 'Carte nationale d\'identité (recto), Carte nationale d\'identité (verso), Selfie avec CNI, Photo d\'identité 4x4',
    importance: 'critical',
    group: 'identification'
  })
  name: string;

  @Column({ type: 'text', nullable: true })
  @BusinessColumn({
    label: 'Description',
    description: 'Description détaillée du type de document et de son usage',
    example: 'Recto de la carte nationale d\'identité, obligatoire pour vérifier l\'identité',
    importance: 'high',
    group: 'contenu'
  })
  description: string;

  @Column({ name: 'validity_duration', nullable: true })
  @BusinessColumn({
    label: 'Durée de validité',
    description: "Nombre de jours pendant lesquels le document est considéré comme valide",
    unit: 'jours',
    example: '365 = 1 an, 730 = 2 ans',
    importance: 'high',
    group: 'règles'
  })
  validityDuration: number;

  @Column({ name: 'mimetype', nullable: true, default: 'image/' })
  @BusinessColumn({
    label: 'Type MIME autorisé',
    description: 'Types de fichiers acceptés (image/, application/pdf, etc.)',
    example: 'image/, application/pdf, application/msword',
    importance: 'medium',
    group: 'règles'
  })
  mimetype: string;

  @Column({ name: 'max_size', nullable: true, default: 1024 * 1024 * 3 })
  @BusinessColumn({
    label: 'Taille maximale',
    description: 'Taille maximale autorisée en octets',
    unit: 'octets',
    example: '3145728 = 3 Mo',
    importance: 'medium',
    group: 'règles'
  })
  max_size: string;

  @ManyToMany(() => DocumentCategory, (category) => category.documentTypes)
  @JoinTable({
    name: 'document_type_categories',
    joinColumn: { name: 'document_type_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'document_category_id', referencedColumnName: 'id' },
  })
  @BusinessColumn({
    label: 'Catégories',
    description: 'Catégories auxquelles appartient ce type de document',
    importance: 'high',
    group: 'classification'
  })
  categories: DocumentCategory[];

  documentCategoryCodes?: string[];

  @Column({ name: 'document_category_id', nullable: true })
  documentCategoryId: number;

  @ManyToMany(() => TypeCustomer)
  @JoinTable({
    name: 'type_customer_document_type',
    joinColumn: { name: 'document_type_id' },
    inverseJoinColumn: { name: 'type_customer_id' },
  })
  @BusinessColumn({
    label: 'Types de client',
    description: 'Types de clients (particulier, professionnel) pour lesquels ce document est requis',
    importance: 'high',
    group: 'relation'
  })
  customerTypes: TypeCustomer[];

  @Column({ name: 'is_required', default: false })
  @BusinessColumn({
    label: 'Obligatoire',
    description: 'True = ce document est obligatoire pour valider le dossier',
    importance: 'critical',
    group: 'règles'
  })
  isRequired: boolean;

  @Column({ nullable: true })
  @BusinessColumn({
    label: 'Statut',
    description: '0 = En attente, 1 = Accepté, 2 = Refusé',
    importance: 'high',
    group: 'état'
  })
  status: number;

  @OneToMany(() => DocumentCustomer, (doc) => doc.document_type, {
    nullable: true,
  })
  @BusinessColumn({
    label: 'Documents',
    description: 'Liste des documents de ce type',
    importance: 'medium',
    group: 'relation'
  })
  documents: DocumentCustomer[];

  // ==================== GETTERS MÉTIER ====================

  @BusinessColumn({
    label: 'Nom complet',
    description: 'Code et nom combinés pour l\'affichage',
    example: 'CNI_AVANT - Carte nationale d\'identité (recto)',
    importance: 'medium',
    group: 'identification'
  })
  get display_name(): string {
    return `${this.code} - ${this.name}`;
  }

  @BusinessColumn({
    label: 'Statut libellé',
    description: 'Libellé lisible du statut',
    importance: 'medium',
    group: 'état'
  })
  get status_label(): string {
    const labels = {
      [DocumentTypeStatus.PENDING]: 'En attente',
      [DocumentTypeStatus.ACCEPTED]: 'Accepté',
      [DocumentTypeStatus.REFUSED]: 'Refusé'
    };
    return labels[this.status] || 'Inconnu';
  }

  @BusinessColumn({
    label: 'Taille max en Mo',
    description: 'Taille maximale autorisée en Mégaoctets',
    unit: 'Mo',
    importance: 'low',
    group: 'règles'
  })
  get max_size_mb(): number {
    const sizeInBytes = parseInt(this.max_size) || 0;
    return Math.round(sizeInBytes / (1024 * 1024));
  }

  @BusinessColumn({
    label: 'Extensions autorisées',
    description: 'Liste des extensions de fichiers autorisées',
    importance: 'low',
    group: 'règles'
  })
  get allowed_extensions(): string[] {
    if (!this.mimetype) return [];
    const mimeToExt: Record<string, string[]> = {
      'image/': ['jpg', 'jpeg', 'png', 'gif', 'webp'],
      'application/pdf': ['pdf'],
      'application/msword': ['doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['docx']
    };
    
    for (const [mime, exts] of Object.entries(mimeToExt)) {
      if (this.mimetype.includes(mime)) {
        return exts;
      }
    }
    return [];
  }

  @BusinessColumn({
    label: 'Types de client requis',
    description: 'Liste des types de client qui doivent fournir ce document',
    importance: 'high',
    group: 'règles'
  })
  get required_customer_types(): string[] {
    return this.customerTypes?.map(ct => ct.name || ct.code).filter(Boolean) || [];
  }

  @BusinessColumn({
    label: 'Est actif',
    description: 'True si le type de document est actif',
    importance: 'medium',
    group: 'état'
  })
  get is_active(): boolean {
    return this.status === DocumentTypeStatus.ACCEPTED;
  }

  @BusinessColumn({
    label: 'Catégories principales',
    description: 'Codes des catégories associées',
    importance: 'medium',
    group: 'classification'
  })
  get category_codes(): string[] {
    return this.categories?.map(cat => cat.code).filter(Boolean) || [];
  }
}