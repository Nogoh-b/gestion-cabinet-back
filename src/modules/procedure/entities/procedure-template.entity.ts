// entities/procedure-template.entity.ts
import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Stage } from './stage.entity';
import { Transition } from './transition.entity';
import { Cycle } from './cycle.entity';

@Entity('procedure_templates')
export class ProcedureTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ nullable: true, type: 'text' })
  description: string;

  @Column({ default: 1 })
  version: number;

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => Stage, (stage) => stage.template, { cascade: true })
  stages: Stage[];

  @OneToMany(() => Transition, (transition) => transition.template, { cascade: true })
  transitions: Transition[];

  @OneToMany(() => Cycle, (cycle) => cycle.template, { cascade: true })
  cycles: Cycle[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}