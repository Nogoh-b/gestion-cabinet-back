// entities/cycle.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ProcedureTemplate } from './procedure-template.entity';
import { Stage } from './stage.entity';

@Entity('cycles')
export class Cycle {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  templateId: string;

  @ManyToOne(() => ProcedureTemplate, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'templateId' })
  template: ProcedureTemplate;

  @Column()
  fromStageId: string;

  @ManyToOne(() => Stage)
  @JoinColumn({ name: 'fromStageId' })
  fromStage: Stage;

  @Column()
  toStageId: string;

  @ManyToOne(() => Stage)
  @JoinColumn({ name: 'toStageId' })
  toStage: Stage;

  @Column({ nullable: true })
  label: string;

  @Column({ nullable: true, type: 'json' })
  condition: any;

  @Column({ default: 1 })
  maxLoops: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}