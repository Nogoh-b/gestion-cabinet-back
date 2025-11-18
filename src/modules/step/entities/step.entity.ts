// entities/step.entity.ts
import { DocumentCustomer } from 'src/modules/documents/document-customer/entities/document-customer.entity';
import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { User } from 'src/modules/iam/user/entities/user.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';








export enum StepType {
  OPENING = 'opening',
  AMIABLE = 'amiable',
  CONTENTIOUS = 'contentious',
  DECISION = 'decision',
  APPEAL = 'appeal',
  CLOSURE = 'closure'
}

export enum StepStatus {
  PENDING = -1,
  IN_PROGRESS = 0,
  COMPLETED = 1,
  CANCELLED = 2
}

@Entity()
export class Step {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({
    type: 'enum',
    enum: StepType
  })
  type: StepType;

  @Column({
    type: 'enum',
    enum: StepStatus,
    default: StepStatus.PENDING
  })
  status: StepStatus;

  @Column()
  title: string;

  @Column('text', { nullable: true })
  description: string;

  @Column({ type: 'date', nullable: true })
  scheduledDate: Date;

  @Column({ type: 'date', nullable: true })
  completedDate: Date;

  @Column('simple-json', { nullable: true })
  metadata: {
    decision?: string;
    court?: string;
    hearingDate?: Date;
    agreementReached?: boolean;
    appealType?: string;
    // Autres métadonnées spécifiques à l'étape
  };

@ManyToOne(() => Dossier, dossier => dossier.steps, { nullable: true })
dossier?: Dossier;

  @ManyToOne(() => User, { nullable: true })
  assignedTo?: User | null;

//   @OneToMany(() => Document, document => document.step)
//   documents: Document[];
  @OneToMany(() => DocumentCustomer, document => document.step)
  documents: DocumentCustomer[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
} 