import { Expose } from 'class-transformer';
import { DocumentType } from 'src/modules/documents/document-type/entities/document-type.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToMany, Unique } from 'typeorm';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';
import { TenantEntity } from 'src/core/entities/tenant.entity';
import { SharedAcrossTenants } from 'src/core/tenant/tenant.decorator';

@SharedAcrossTenants()
@Entity('document_categories')
@BusinessTable({
  label: "Catégories de documents",
  description: "Classification des documents par catégorie (procedural, client, internal, financial, decision, etc.). Chaque catégorie peut avoir des règles spécifiques (durée de conservation, types de fichiers autorisés, niveau de confidentialité).",
  icon: '📁',
  category: 'document'
})
@Unique(['tenant_id', 'code'])
export class DocumentCategory extends TenantEntity {
  @PrimaryGeneratedColumn()
  @Expose()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique de la catégorie',
    importance: 'low',
    group: 'technique',
    ignored: true
  })
  id: number;

  @Column()
  @Expose()
  @BusinessColumn({
    label: 'Code',
    description: 'Code unique identifiant la catégorie (format court)',
    example: 'PROC, CLIENT, INTERNAL, FINANCIAL, DECISION',
    importance: 'high',
    group: 'identification'
  })
  code: string;

  @Column()
  @Expose()
  @BusinessColumn({
    label: 'Nom',
    description: 'Nom de la catégorie de documents',
    example: 'Documents procéduraux, Documents clients, Documents internes, Documents financiers, Décisions de justice',
    importance: 'critical',
    group: 'identification'
  })
  name: string;

  @Column({ type: 'text', nullable: true })
  @Expose()
  @BusinessColumn({
    label: 'Description',
    description: 'Description détaillée de la catégorie et de son utilisation',
    example: 'Actes de procédure officiels (assignations, conclusions, significations)',
    importance: 'high',
    group: 'contenu'
  })
  description: string;

  @Column({ nullable: true })
  @Expose()
  @BusinessColumn({
    label: 'Icône',
    description: 'Nom de l\'icône pour l\'affichage UI',
    importance: 'low',
    group: 'présentation',
    ignored: true
  })
  icon: string;

  @Column({ default: '#4F46E5' })
  @Expose()
  @BusinessColumn({
    label: 'Couleur',
    description: 'Couleur associée à la catégorie (format hexadécimal)',
    example: '#4F46E5 (indigo), #10B981 (vert), #EF4444 (rouge)',
    importance: 'low',
    group: 'présentation',
    ignored: true
  })
  color: string;

  @Column({ default: 0 })
  @Expose()
  @BusinessColumn({
    label: "Ordre d'affichage",
    description: 'Position dans les listes triées',
    importance: 'low',
    group: 'présentation',
    ignored: true
  })
  sort_order: number;

  @Column({ default: true })
  @Expose()
  @BusinessColumn({
    label: 'Actif',
    description: 'True = catégorie active et utilisable',
    importance: 'high',
    group: 'état'
  })
  is_active: boolean;

  @Column({ default: false })
  @Expose()
  @BusinessColumn({
    label: 'Système',
    description: 'True = catégorie système (ne peut pas être supprimée)',
    importance: 'low',
    group: 'état',
    ignored: true
  })
  is_system: boolean;

  @Column({ type: 'json', nullable: true })
  @Expose()
  @BusinessColumn({
    label: 'Métadonnées',
    description: 'Configuration avancée: durée de conservation, types de fichiers autorisés, taille max, validation requise',
    importance: 'low',
    group: 'technique',
    ignored: true
  })
  metadata: {
    retention_period?: number; // en jours
    allowed_mime_types?: string[];
    max_file_size_mb?: number;
    requires_validation?: boolean;
    board_approval?: boolean;
    shareholder_rights?: boolean;
    corporate_governance?: boolean;
    intellectual_property?: boolean;
    technical_validation?: boolean;
    methodology_documented?: boolean;
    peer_review?: boolean;
    gdpr_compliance?: boolean;
    tax_withholding?: boolean;
    social_security?: boolean;
    employee_rights?: boolean;
    legal_importance?: string;
    confidentiality_level?: 'public' | 'internal' | 'confidential' | 'strictly_confidential';
  };

  @ManyToMany(() => DocumentType, (documentType) => documentType.categories)
  @BusinessColumn({
    label: 'Types de documents',
    description: 'Types de documents associés à cette catégorie',
    importance: 'high',
    group: 'relation'
  })
  documentTypes: DocumentType[];

  // ==================== GETTERS MÉTIER ====================

  @BusinessColumn({
    label: 'Nom complet',
    description: 'Code et nom combinés pour l\'affichage',
    example: 'PROC - Documents procéduraux',
    importance: 'medium',
    group: 'identification'
  })
  get display_name(): string {
    return `${this.code} - ${this.name}`;
  }

  @BusinessColumn({
    label: 'Statut',
    description: 'Actif ou Inactif',
    importance: 'medium',
    group: 'état'
  })
  get status_label(): string {
    return this.is_active ? 'Actif' : 'Inactif';
  }

  @BusinessColumn({
    label: 'Niveau de confidentialité',
    description: 'public, internal, confidential, strictly_confidential',
    importance: 'high',
    group: 'sécurité'
  })
  get confidentiality_level(): string {
    return this.metadata?.confidentiality_level || 'internal';
  }

  @BusinessColumn({
    label: 'Durée de conservation',
    description: "Nombre de jours de conservation des documents",
    unit: 'jours',
    importance: 'medium',
    group: 'règles'
  })
  get retention_period_days(): number | null {
    return this.metadata?.retention_period || null;
  }

  @BusinessColumn({
    label: 'Taille max autorisée',
    description: "Taille maximale des fichiers en Mo",
    unit: 'Mo',
    importance: 'medium',
    group: 'règles'
  })
  get max_file_size_mb(): number | null {
    return this.metadata?.max_file_size_mb || null;
  }

  @BusinessColumn({
    label: 'Validation requise',
    description: 'True = les documents nécessitent une validation',
    importance: 'high',
    group: 'règles'
  })
  get requires_validation(): boolean {
    return this.metadata?.requires_validation || false;
  }

  @BusinessColumn({
    label: "Nombre de types documentaires",
    description: "Nombre de types de documents dans cette catégorie",
    importance: 'low',
    group: 'statistiques'
  })
  get document_types_count(): number {
    return this.documentTypes?.length || 0;
  }
}