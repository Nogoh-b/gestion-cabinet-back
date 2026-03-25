import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    ManyToOne,
    JoinColumn,
    CreateDateColumn,
} from 'typeorm';
import { ProcedureInstance } from './procedure-instance.entity';
import { Stage } from './stage.entity';
import { Transition } from './transition.entity';

@Entity('decisions')
export class Decision {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  instanceId: string;

  @ManyToOne(() => ProcedureInstance, (instance) => instance.decisions)
  @JoinColumn({ name: 'instanceId' })
  instance: ProcedureInstance;

  @Column()
  fromStageId: string;

  @ManyToOne(() => Stage)
  @JoinColumn({ name: 'fromStageId' })
  fromStage: Stage;

  @Column()
  transitionId: string;

  @ManyToOne(() => Transition)
  @JoinColumn({ name: 'transitionId' })
  transition: Transition;

  @Column()
  toStageId: string;

  @Column({ type: 'varchar', nullable: true })
  userId: string | null;

  @Column({ nullable: true, type: 'text' })
  comment: string | null;  // Ajouter | null

  @CreateDateColumn()
  createdAt: Date;
}