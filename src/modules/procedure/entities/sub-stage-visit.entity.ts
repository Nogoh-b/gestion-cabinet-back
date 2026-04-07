import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn, ManyToMany,
  JoinTable,
  OneToMany
} from 'typeorm';
import { StageVisit } from './stage-visit.entity';
import { SubStage } from './sub-stage.entity';
import { DocumentCustomer } from 'src/modules/documents/document-customer/entities/document-customer.entity';
import { Diligence } from 'src/modules/diligence/entities/diligence.entity';
import { Audience } from 'src/modules/audiences/entities/audience.entity';
import { Facture } from 'src/modules/facture/entities/facture.entity';

@Entity('sub_stage_visits')
export class SubStageVisit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  stageVisitId: string;

  @ManyToOne(() => StageVisit, (visit) => visit.subStageVisits, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'stageVisitId' })
  stageVisit: StageVisit;

  @Column()
  subStageId: string;

  @ManyToOne(() => SubStage, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'subStageId' })
  subStage: SubStage;

  @Column({ default: false })
  isCompleted: boolean;

  @Column({ type: 'json', nullable: true })
  metadata: any;   // notes, startedAt, completedAt, etc.

  @CreateDateColumn()
  startedAt: Date;

  @Column({ nullable: true })
  completedAt: Date;

  // Relations spécifiques à cette exécution de sous-étape
  @ManyToMany(() => DocumentCustomer)
  @JoinTable({
    name: 'sub_stage_visit_documents',
    joinColumn: { name: 'sub_stage_visit_id' },
    inverseJoinColumn: { name: 'document_id' },
  })
  documents: DocumentCustomer[];

  @OneToMany(() => Diligence, (d) => d.subStageVisit)
  diligences: Diligence[];

  @OneToMany(() => Audience, (a) => a.subStageVisit)
  audiences: Audience[];

  @OneToMany(() => Facture, (f) => f.subStageVisit)
  factures: Facture[];
}