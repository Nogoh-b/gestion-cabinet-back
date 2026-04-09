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
import { ProcedureInstance } from './procedure-instance.entity';
import { Stage } from './stage.entity';
import { DocumentCustomer } from 'src/modules/documents/document-customer/entities/document-customer.entity';
import { Diligence } from 'src/modules/diligence/entities/diligence.entity';
import { Audience } from 'src/modules/audiences/entities/audience.entity';
import { Facture } from 'src/modules/facture/entities/facture.entity';
import { SubStageVisit } from './sub-stage-visit.entity';

@Entity('stage_visits')
export class StageVisit {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  instanceId: string;

  @ManyToOne(() => ProcedureInstance, instance => instance.stageVisits, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'instanceId' })
  instance: ProcedureInstance;

  @Column()
  stageId: string;

  @ManyToOne(() => Stage, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'stageId' })
  stage: Stage;

  @Column()
  visitNumber: number;           // 1 = première fois, 2 = deuxième fois, etc.

  @Column({ type: 'json', nullable: true })
  completedSubStages: string[];  // Sous-étapes complétées pendant CETTE visite uniquement


  @OneToMany(() => SubStageVisit, (subVisit) => subVisit.stageVisit, { cascade: true })
  subStageVisits: SubStageVisit[];


  @Column({ type: 'uuid', nullable: true })
  currentSubStageVisitId?: string | null;

  // Relation optionnelle pour accéder facilement à la sous-étape en cours
  @ManyToOne(() => SubStageVisit, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'currentSubStageVisitId' })
  currentSubStageVisit?: SubStageVisit | null;


  @Column({ type: 'json', nullable: true })
  subStageMetadata: Record<string, any>;

  @CreateDateColumn()
  enteredAt: Date;

  @Column({ nullable: true })
  exitedAt: Date;

  // Relations spécifiques à cette visite
  @OneToMany(() => Facture, facture => facture.stageVisit)
  factures: Facture[];

  @ManyToMany(() => DocumentCustomer, document => document.stageVisits)
  @JoinTable({
    name: 'stage_visit_documents',
    joinColumn: { name: 'stage_visit_id' },
    inverseJoinColumn: { name: 'document_id' },
  })
  documents: DocumentCustomer[];

  @OneToMany(() => Diligence, diligence => diligence.stageVisit)
  diligences: Diligence[];

  @OneToMany(() => Audience, audience => audience.stageVisit)
  audiences: Audience[];

  @UpdateDateColumn()
  updatedAt: Date;
}