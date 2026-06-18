// jurisdiction.entity.ts
import {
    Entity,
    PrimaryGeneratedColumn,
    Column, OneToMany,
    ManyToOne,
    JoinColumn,
    Unique
} from 'typeorm';
import { Expose } from 'class-transformer';
import { Audience } from 'src/modules/audiences/entities/audience.entity';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';
import { TenantEntity as BaseEntity } from 'src/core/entities/tenant.entity';


export enum JurisdictionLevel {
  MUNICIPAL = 'municipal',
  REGIONAL = 'regional',
  NATIONAL = 'national',
  INTERNATIONAL = 'international'
}

export enum JurisdictionType {
  CIVIL = 'civil',
  COMMERCIAL = 'commercial',
  ADMINISTRATIVE = 'administrative',
  PENAL = 'penal',
  LABOR = 'labor',
  FAMILY = 'family'
}

@Entity('jurisdictions')
@BusinessTable({
  label: 'Juridictions',
  description: 'Tribunaux et cours de justice. Une juridiction peut être civile, commerciale, administrative, pénale, prud\'homale ou familiale.',
  icon: '⚖️',
  category: 'judiciaire'
})
@Unique(['tenant_id', 'code'])
export class Jurisdiction  extends BaseEntity{
  @PrimaryGeneratedColumn()
  @Expose()
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique de la juridiction',
    importance: 'low',
    group: 'technique',
    ignored: true
  })
  id: number;

  @Column()
  @Expose()
  @BusinessColumn({
    label: 'Code',
    description: 'Code unique de la juridiction',
    example: 'TJ_PARIS, CA_DOUALA, TGI_YDE',
    importance: 'high',
    group: 'identification'
  })
  code: string;

  @Column()
  @Expose()
  @BusinessColumn({
    label: 'Nom',
    description: 'Nom officiel de la juridiction',
    example: 'Tribunal judiciaire de Paris, Cour d\'appel de Douala',
    importance: 'critical',
    group: 'identification'
  })
  name: string;

  @Column({ type: 'text', nullable: true })
  @Expose()
  @BusinessColumn({
    label: 'Description',
    description: 'Description détaillée de la juridiction',
    importance: 'medium',
    group: 'contenu'
  })
  description: string;

  @Column({
    type: 'enum',
    enum: JurisdictionLevel,
    default: JurisdictionLevel.REGIONAL
  })
  @Expose()
  @BusinessColumn({
    label: 'Niveau',
    description: 'municipal (Municipal), regional (Régional), national (National), international (International)',
    importance: 'high',
    group: 'classification'
  })
  level: JurisdictionLevel;

  @Column({
    type: 'enum',
    enum: JurisdictionType,
    default: JurisdictionType.CIVIL
  })
  @Expose()
  @BusinessColumn({
    label: 'Type',
    description: 'civil (Civil), commercial (Commercial), administrative (Administratif), penal (Pénal), labor (Prud\'hommes), family (Famille)',
    importance: 'critical',
    group: 'classification'
  })
  jurisdiction_type: JurisdictionType;

  @Column({ nullable: true })
  @Expose()
  @BusinessColumn({
    label: 'Ville',
    description: 'Ville où siège la juridiction',
    example: 'Paris, Douala, Lyon',
    importance: 'high',
    group: 'localisation'
  })
  city: string;

  @Column({ nullable: true })
  @Expose()
  @BusinessColumn({
    label: 'Région',
    description: 'Région de la juridiction',
    example: 'Île-de-France, Littoral',
    importance: 'medium',
    group: 'localisation'
  })
  region: string;

  @Column({ default: 'France' })
  @Expose()
  @BusinessColumn({
    label: 'Pays',
    description: 'Pays de la juridiction',
    example: 'France, Cameroun',
    importance: 'high',
    group: 'localisation'
  })
  country: string;

  @Column({ nullable: true })
  @Expose()
  @BusinessColumn({
    label: 'Adresse',
    description: 'Adresse postale complète',
    importance: 'medium',
    group: 'coordonnées'
  })
  address: string;

  @Column({ nullable: true })
  @Expose()
  @BusinessColumn({
    label: 'Téléphone',
    description: 'Numéro de téléphone du greffe',
    format: 'phone',
    importance: 'medium',
    group: 'coordonnées'
  })
  phone: string;

  @Column({ nullable: true })
  @Expose()
  @BusinessColumn({
    label: 'Email',
    description: 'Adresse email du greffe',
    format: 'email',
    importance: 'medium',
    group: 'coordonnées'
  })
  email: string;

  @Column({ nullable: true })
  @Expose()
  @BusinessColumn({
    label: 'Site web',
    description: 'Site internet officiel',
    importance: 'low',
    group: 'coordonnées'
  })
  website: string;

  @Column({ name: 'parent_id', nullable: true })
  parent_id: number;

  @ManyToOne(() => Jurisdiction, { nullable: true })
  @JoinColumn({ name: 'parent_id' })
  @Expose()
  @BusinessColumn({
    label: 'Juridiction parente',
    description: 'Juridiction hiérarchiquement supérieure (ex: Cour d\'appel pour un TGI)',
    importance: 'medium',
    group: 'relation'
  })
  parent_jurisdiction: Jurisdiction;

  @OneToMany(() => Audience, audience => audience.jurisdiction)
  @Expose()
  audiences: Audience[];

  @Column({ default: true })
  @Expose()
  @BusinessColumn({
    label: 'Active',
    description: 'True = juridiction active',
    importance: 'high',
    group: 'état'
  })
  is_active: boolean;

  @Column({ type: 'json', nullable: true })
  @Expose()
  @BusinessColumn({
    label: 'Métadonnées',
    description: 'Informations supplémentaires',
    importance: 'low',
    group: 'technique',
    ignored: true
  })
  metadata: {
    timezone?: string;
    working_hours?: string[];
    holidays?: string[];
    court_number?: string;
    judge_name?: string;
  };

 

  @Column({ nullable: true })
  @Expose()
  created_by: number;

  @Column({ nullable: true })
  @Expose()
  updated_by: number;
}