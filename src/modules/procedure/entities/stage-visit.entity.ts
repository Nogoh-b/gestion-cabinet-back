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
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';
import { TenantEntity as BaseEntity } from 'src/core/entities/tenant.entity';

@Entity('stage_visits')
@BusinessTable({
  label: 'Visites d\'étape',
  description: 'Enregistrement des passages sur une étape durant le suivi d\'une instance de procédure',
  icon: '👣',
  category: 'procedure',
  ignored: true,
})
export class StageVisit extends BaseEntity {
    @PrimaryGeneratedColumn('uuid')
  @BusinessColumn({ label: 'Identifiant', description: 'Identifiant unique', importance: 'low', group: 'technique', ignored: true })
  id: string;

  @Column()
  @BusinessColumn({ label: 'Instance', description: 'Instance de procédure', importance: 'high', group: 'relation', ignored: true })
  instanceId: string;

  @ManyToOne(() => ProcedureInstance, instance => instance.stageVisits, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'instanceId' })
  instance: ProcedureInstance;

  @Column()
  @BusinessColumn({ label: 'Étape', description: 'Étape visitée', importance: 'high', group: 'relation', ignored: true })
  stageId: string;

  @ManyToOne(() => Stage, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'stageId' })
  stage: Stage;

  @Column()
  @BusinessColumn({ label: 'N° de visite', description: 'Numéro de visite (1=première)', importance: 'medium', group: 'suivi' })
  visitNumber: number;

  @Column({ type: 'json', nullable: true })
  completedSubStages: string[];

  @OneToMany(() => SubStageVisit, (subVisit) => subVisit.stageVisit, { cascade: true })
  subStageVisits: SubStageVisit[];

  @Column({ type: 'uuid', nullable: true })
  currentSubStageVisitId?: string | null;

  @ManyToOne(() => SubStageVisit, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'currentSubStageVisitId' })
  currentSubStageVisit?: SubStageVisit | null;

  @Column({ type: 'json', nullable: true })
  subStageMetadata: Record<string, any>;

  @CreateDateColumn()
  enteredAt: Date;

  @Column({ nullable: true })
  exitedAt: Date;

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