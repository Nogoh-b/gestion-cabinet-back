import { Expose } from 'class-transformer';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';
import { TenantEntity } from 'src/core/entities/tenant.entity';
import { SharedAcrossTenants } from 'src/core/tenant/tenant.decorator';
import { Audience } from 'src/modules/audiences/entities/audience.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  Unique
} from 'typeorm';


export enum AudienceTypeCategory {
  PRELIMINARY = 'preliminary',
  HEARING = 'hearing',
  JUDGMENT = 'judgment',
  CONCILIATION = 'conciliation',
  EXPERTISE = 'expertise',
  APPEAL = 'appeal',
  CASATION = 'casation'
}

@SharedAcrossTenants()
@Entity('audience_types')
@BusinessTable({
  label: 'Types d\'audience',
  description: 'Référentiel des types d\'audience possibles dans une procédure judiciaire. Définit les caractéristiques de chaque type (durée par défaut, publicité, nécessité d\'un avocat, etc.).',
  icon: '⚖️',
  category: 'procedure'
})
@Unique(['tenant_id', 'code'])
export class AudienceType extends TenantEntity {
  @PrimaryGeneratedColumn()
  @Expose()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique du type d\'audience',
    importance: 'low',
    group: 'technique',
    ignored: true
  })
  id: number;

  @Column()
  @Expose()
  @BusinessColumn({
    label: 'Code',
    description: 'Code unique identifiant le type d\'audience. Format court pour référence technique.',
    example: 'HEAR_CIVIL, JUG_CORR, CONCIL',
    importance: 'high',
    group: 'identification'
  })
  code: string;

  @Column()
  @Expose()
  @BusinessColumn({
    label: 'Nom',
    description: 'Nom lisible du type d\'audience. Exprime la nature de l\'audience.',
    example: 'Audience de plaidoirie, Audience de jugement, Audience de conciliation',
    importance: 'critical',
    group: 'identification'
  })
  name: string;

  @Column({ type: 'text', nullable: true })
  @Expose()
  @BusinessColumn({
    label: 'Description',
    description: 'Description détaillée du type d\'audience, son objet et ses spécificités procédurales.',
    example: 'Audience au cours de laquelle les avocats présentent leurs arguments oraux devant le juge',
    importance: 'high',
    group: 'contenu'
  })
  description: string;

  @Column({
    type: 'enum',
    enum: AudienceTypeCategory,
    default: AudienceTypeCategory.HEARING
  })
  @Expose()
  @BusinessColumn({
    label: 'Catégorie',
    description: "BD: 'preliminary', 'hearing', 'judgment', 'conciliation', 'expertise', 'appeal', 'casation'.",
    example: 'hearing, judgment, appeal',
    importance: 'critical',
    group: 'classification'
  })
  category: AudienceTypeCategory;

  @Column({ default: 60 })
  @Expose()
  @BusinessColumn({
    label: 'Durée par défaut',
    description: 'Durée standard prévue pour ce type d\'audience, en minutes',
    unit: 'minutes',
    example: '60 = 1 heure, 120 = 2 heures',
    importance: 'high',
    group: 'planification'
  })
  default_duration_minutes: number;

  @Column({ default: true })
  @Expose()
  @BusinessColumn({
    label: 'Public',
    description: 'True = audience publique ouverte au public, False = huis clos / audience à huis clos',
    importance: 'high',
    group: 'caractéristiques'
  })
  is_public: boolean;

  @Column({ default: false })
  @Expose()
  @BusinessColumn({
    label: 'Nécessite un avocat',
    description: 'True = la représentation par avocat est obligatoire, False = facultative',
    importance: 'high',
    group: 'caractéristiques'
  })
  requires_lawyer: boolean;

  @Column({ default: false })
  @Expose()
  @BusinessColumn({
    label: 'Permet le distanciel',
    description: 'True = l\'audience peut se tenir à distance (visioconférence), False = présence physique obligatoire',
    importance: 'medium',
    group: 'caractéristiques'
  })
  allows_remote: boolean;

  @Column({ default: true })
  @Expose()
  @BusinessColumn({
    label: 'Actif',
    description: 'True = ce type d\'audience peut être utilisé pour de nouvelles audiences, False = désactivé',
    importance: 'high',
    group: 'état'
  })
  is_active: boolean;

  @Column({ type: 'json', nullable: true })
  @Expose()
  @BusinessColumn({
    label: 'Métadonnées',
    description: 'Informations supplémentaires: documents requis, délai de préparation, issues possibles, base légale',
    importance: 'low',
    group: 'technique',
    ignored: true
  })
  metadata: {
    required_documents?: number[];
    preparation_time_days?: number;
    possible_outcomes?: string[];
    legal_basis?: string;
  };

  @OneToMany(() => Audience, audience => audience.audience_type)
  @Expose()
  audiences: Audience[];

  // ==================== GETTERS MÉTIER ====================

  @Expose()
  @BusinessColumn({
    label: 'Nom complet',
    description: 'Code et nom combinés pour l\'affichage',
    example: 'HEAR_CIVIL - Audience de plaidoirie',
    importance: 'medium',
    group: 'identification'
  })
  get full_name(): string {
    return `${this.code} - ${this.name}`;
  }

  @Expose()
  @BusinessColumn({
    label: 'Catégorie libellée',
    description: 'Libellé court de la catégorie',
    importance: 'medium',
    group: 'classification'
  })
  get category_label(): string {
    const labels: Record<AudienceTypeCategory, string> = {
      [AudienceTypeCategory.PRELIMINARY]: 'Préparatoire',
      [AudienceTypeCategory.HEARING]: 'Plaidoirie',
      [AudienceTypeCategory.JUDGMENT]: 'Jugement',
      [AudienceTypeCategory.CONCILIATION]: 'Conciliation / Médiation',
      [AudienceTypeCategory.EXPERTISE]: 'Expertise',
      [AudienceTypeCategory.APPEAL]: 'Appel',
      [AudienceTypeCategory.CASATION]: 'Cassation'
    };
    return labels[this.category] || this.category;
  }

  @Expose()
  @BusinessColumn({
    label: 'Durée en heures',
    description: 'Durée par défaut en heures (arrondie)',
    unit: 'heures',
    importance: 'low',
    group: 'planification'
  })
  get default_duration_hours(): number {
    return Math.round(this.default_duration_minutes / 60);
  }

  @Expose()
  @BusinessColumn({
    label: 'Format court',
    description: 'Résumé des caractéristiques principales',
    example: 'Public · Sans avocat · En présentiel',
    importance: 'low',
    group: 'caractéristiques'
  })
  get short_summary(): string {
    const parts: string[] = [];
    parts.push(this.is_public ? 'Public' : 'Huis clos');
    parts.push(this.requires_lawyer ? 'Avocat obligatoire' : 'Avocat facultatif');
    parts.push(this.allows_remote ? 'Visio possible' : 'Présentiel');
    return parts.join(' · ');
  }
}
