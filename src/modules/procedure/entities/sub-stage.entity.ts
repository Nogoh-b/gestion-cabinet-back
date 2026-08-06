// entities/sub-stage.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  ManyToMany,
  JoinTable,
} from 'typeorm';
import { Stage } from './stage.entity';
import { Facture } from 'src/modules/facture/entities/facture.entity';
import { DocumentCustomer } from 'src/modules/documents/document-customer/entities/document-customer.entity';
import { Diligence } from 'src/modules/diligence/entities/diligence.entity';
import { Audience } from 'src/modules/audiences/entities/audience.entity';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';
import { TenantEntity as BaseEntity } from 'src/core/entities/tenant.entity';
import { ProcedureRequirement } from '../interfaces/procedure-requirement.interface';

@Entity('sub_stages')
@BusinessTable({
  label: 'Sous-étapes',
  description: 'Sous-étapes d\'une étape de procédure. Représentent les actions élémentaires à réaliser pour valider une étape.',
  icon: '🔹',
  category: 'procedure',
  ignored: false,
})
export class SubStage extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique de la sous-étape (format UUID)',
    importance: 'low',
    group: 'technique',
    ignored: false,
  })
  id: string;

  @Column()
  @BusinessColumn({
    label: 'Étape',
    description: 'Identifiant de l\'étape parente',
    importance: 'high',
    group: 'relation',
    ignored: false,
  })
  stageId: string;

  @ManyToOne(() => Stage, (stage) => stage.subStages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'stageId' })
  stage: Stage;

  @Column()
  @BusinessColumn({
    label: 'Ordre',
    description: 'Position de la sous-étape dans l\'étape',
    example: '1',
    importance: 'high',
    group: 'organisation',
  })
  order: number;

  @Column()
  @BusinessColumn({
    label: 'Nom',
    description: 'Nom de la sous-étape',
    example: 'Constitution du dossier',
    importance: 'critical',
    group: 'identification',
  })
  name: string;

  @Column({ nullable: true, type: 'text' })
  @BusinessColumn({
    label: 'Description',
    description: 'Description de la sous-étape et des actions à réaliser',
    example: 'Rassembler toutes les pièces nécessaires à la constitution du dossier',
    importance: 'high',
    group: 'identification',
  })
  description: string;

  @Column({ default: true })
  @BusinessColumn({
    label: 'Obligatoire',
    description: 'Indique si cette sous-étape doit obligatoirement être réalisée',
    importance: 'high',
    group: 'règles',
  })
  isMandatory: boolean;

  @Column({ type: 'json', nullable: true })
  @BusinessColumn({
    label: 'Exigences',
    description:
      'Exigences métier à satisfaire avant de pouvoir terminer la sous-étape',
    importance: 'critical',
    group: 'règles',
  })
  requirements: ProcedureRequirement[] | null;

    @OneToMany(() => Facture, (facture) => facture.subStage)
  factures: Facture[];

  @ManyToMany(() => DocumentCustomer, (document) => document.subStages)
  @JoinTable({
    name: 'sub_stage_documents', // Table de jointure explicite
    joinColumn: { name: 'sub_stage_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'document_id', referencedColumnName: 'id' }
  })
  documents: DocumentCustomer[];

  @OneToMany(() => Diligence, (diligence) => diligence.subStage)
  diligences: Diligence[];

  @OneToMany(() => Audience, (audience) => audience.subStage)
  audiences: Audience[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
