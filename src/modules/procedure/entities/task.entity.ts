// entities/task.entity.ts
import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    ManyToOne,
    JoinColumn,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm';
import { ProcedureInstance } from './procedure-instance.entity';
import { TaskStatus } from './enums/instance-status.enum';
import { BusinessTable, BusinessColumn } from 'src/core/decorators/business-metadata.decorator';
import { BaseEntity } from 'src/core/entities/baseEntity';

@Entity('tasks')
@BusinessTable({
  label: 'Tâches',
  description: 'Tâches associées à une instance de procédure. Actions à réaliser avec échéance et assignation.',
  icon: '✅',
  category: 'procedure',
})
export class Task extends BaseEntity {
  @PrimaryGeneratedColumn('uuid')
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Identifiant unique de la tâche (format UUID)',
    importance: 'low',
    group: 'technique',
    ignored: true,
  })
  id: string;

  @Column()
  @BusinessColumn({
    label: 'Instance',
    description: 'Identifiant de l\'instance de procédure',
    importance: 'high',
    group: 'relation',
    ignored: true,
  })
  instanceId: string;

  @ManyToOne(() => ProcedureInstance, (instance) => instance.tasks)
  @JoinColumn({ name: 'instanceId' })
  instance: ProcedureInstance;

  @Column()
  @BusinessColumn({
    label: 'Titre',
    description: 'Titre de la tâche',
    example: 'Signer la convention',
    importance: 'critical',
    group: 'identification',
  })
  title: string;

  @Column({ nullable: true })
  @BusinessColumn({
    label: 'Description',
    description: 'Description détaillée de la tâche',
    example: 'Faire signer la convention de divorce à toutes les parties',
    importance: 'high',
    group: 'identification',
  })
  description: string;

  @Column({ nullable: true })
  @BusinessColumn({
    label: 'Date d\'échéance',
    description: 'Date limite pour réaliser la tâche',
    format: 'date',
    example: '2025-12-31',
    importance: 'high',
    group: 'dates',
  })
  dueDate: Date;

  @Column({ nullable: true })
  @BusinessColumn({
    label: 'Assigné à',
    description: 'Identifiant de l\'utilisateur assigné à la tâche',
    importance: 'high',
    group: 'relation',
  })
  assignedTo: string;

  @Column({ type: 'enum', enum: TaskStatus, default: TaskStatus.PENDING })
  @BusinessColumn({
    label: 'Statut',
    description: 'pending (En attente), in_progress (En cours), completed (Terminée), cancelled (Annulée)',
    importance: 'critical',
    group: 'état',
  })
  status: TaskStatus;

  @Column({ nullable: true })
  @BusinessColumn({
    label: 'Date de complétion',
    description: 'Date à laquelle la tâche a été terminée',
    format: 'date',
    importance: 'medium',
    group: 'dates',
  })
  completedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}