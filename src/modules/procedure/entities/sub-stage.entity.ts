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

@Entity('sub_stages')
export class SubStage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  stageId: string;

  @ManyToOne(() => Stage, (stage) => stage.subStages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'stageId' })
  stage: Stage;

  @Column()
  order: number;

  @Column()
  name: string;

  @Column({ nullable: true, type: 'text' })
  description: string;

  @Column({ default: true })
  isMandatory: boolean;


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