import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  ManyToMany,
  JoinTable,
  OneToMany,
} from 'typeorm';
import { StageVisit } from './stage-visit.entity';
import { SubStage } from './sub-stage.entity';
import { DocumentCustomer } from 'src/modules/documents/document-customer/entities/document-customer.entity';
import { Diligence } from 'src/modules/diligence/entities/diligence.entity';
import { Audience } from 'src/modules/audiences/entities/audience.entity';
import { Facture } from 'src/modules/facture/entities/facture.entity';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';
import { BaseEntity } from 'src/core/entities/baseEntity';

@Entity('sub_stage_visits')
@BusinessTable({
  label: 'Exécutions de sous-étape',
  description: 'Enregistrement de l\'exécution d\'une sous-étape lors d\'une visite d\'étape',
  icon: '🔹',
  category: 'procedure',
  ignored: true,
})
export class SubStageVisit extends BaseEntity {
    @PrimaryGeneratedColumn('uuid')
  @BusinessColumn({ label: 'Identifiant', description: 'Identifiant unique', importance: 'low', group: 'technique', ignored: true })
  id: string;

  @Column()
  @BusinessColumn({ label: 'Visite d\'étape', description: 'Visite d\'étape associée', importance: 'high', group: 'relation', ignored: true })
  stageVisitId: string;

  @ManyToOne(() => StageVisit, (visit) => visit.subStageVisits, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'stageVisitId' })
  stageVisit: StageVisit;

  @Column()
  @BusinessColumn({ label: 'Sous-étape', description: 'Sous-étape exécutée', importance: 'high', group: 'relation', ignored: true })
  subStageId: string;

  @ManyToOne(() => SubStage, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subStageId' })
  subStage: SubStage;

  @Column({ default: false })
  @BusinessColumn({ label: 'Terminée', description: 'Indique si la sous-étape a été complétée', importance: 'high', group: 'état' })
  isCompleted: boolean;

  @Column({ type: 'json', nullable: true })
  metadata: any;

  @CreateDateColumn()
  startedAt: Date;

  @Column({ nullable: true })
  completedAt: Date;

  @ManyToMany(() => DocumentCustomer)
  @JoinTable({
    name: 'sub_stage_visit_documents',
    joinColumn: { name: 'sub_stage_visit_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'document_id', referencedColumnName: 'id' },
  })
  documents: DocumentCustomer[];

  @OneToMany(() => Diligence, (d) => d.subStageVisit)
  diligences: Diligence[];

  @OneToMany(() => Audience, (a) => a.subStageVisit)
  audiences: Audience[];

  @OneToMany(() => Facture, (f) => f.subStageVisit)
  factures: Facture[];
}