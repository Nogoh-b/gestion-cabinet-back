// entities/procedure-instance.entity.ts
import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    ManyToOne,
    JoinColumn,
    OneToMany,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';
import { ProcedureTemplate } from './procedure-template.entity';
import { Stage } from './stage.entity';
import { Decision } from './decision.entity';
import { Task } from './task.entity';
import { InstanceStatus } from './enums/instance-status.enum';
import { HistoryEntry } from './history-entry.entity';

@Entity('procedure_instances')
export class ProcedureInstance {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  templateId: string;

  @ManyToOne(() => ProcedureTemplate)
  @JoinColumn({ name: 'templateId' })
  template: ProcedureTemplate;

  @Column()
  title: string;

  @Column({ type: 'enum', enum: InstanceStatus, default: InstanceStatus.ACTIVE })
  status: InstanceStatus;

  @Column()
  currentStageId: string;

  @ManyToOne(() => Stage)
  @JoinColumn({ name: 'currentStageId' })
  currentStage: Stage;

  @Column({ type: 'json', nullable: true })
  data: any;

  @OneToMany(() => Decision, (decision) => decision.instance, { cascade: true })
  decisions: Decision[];

  @OneToMany(() => HistoryEntry, (history) => history.instance, { cascade: true })
  history: HistoryEntry[];

  @OneToMany(() => Task, (task) => task.instance, { cascade: true })
  tasks: Task[];

 @Column({ type: 'json', nullable: true })
  completedSubStages: string[];

  @Column({ type: 'json', nullable: true })
  cycleUsageCount: Record<string, number>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}