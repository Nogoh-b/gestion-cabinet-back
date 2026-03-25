// entities/sub-stage.entity.ts
import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    ManyToOne,
    JoinColumn,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';
import { Stage } from './stage.entity';

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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}