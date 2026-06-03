import { User } from "src/modules/iam/user/entities/user.entity";
import { Column, Entity, ManyToOne, PrimaryGeneratedColumn } from "typeorm";
import { Step } from "./step.entity";
import { TenantEntity } from 'src/core/entities/tenant.entity';

// entities/step-action.entity.ts
export enum ActionType {
  DILIGENCE = 'diligence',
  DOCUMENT = 'document',
  AUDIENCE = 'audience',
  FACTURE = 'facture'
}

export enum ActionStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled'
}

@Entity()
export class StepAction extends TenantEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'enum', enum: ActionType })
  type: ActionType;

  @Column({ type: 'enum', enum: ActionStatus, default: ActionStatus.PENDING })
  status: ActionStatus;

  @Column()
  title: string;

  @Column('text')
  description: string;

  @Column({ type: 'text', nullable: true })
  tooltipMessage: string; // Le message que vous aviez dans getAllowedActionsByState

  @Column({ type: 'date', nullable: true })
  scheduledDate: Date;

  @Column({ type: 'date', nullable: true })
  completedDate: Date;

  @Column('simple-json', { nullable: true })
  result: any; // Résultat de l'action (ex: document généré, décision de l'audience, etc.)

  @ManyToOne(() => Step, step => step.actions)
  step: Step;

  @ManyToOne(() => User, { nullable: true })
  assignedTo: User;

  // created_at, updated_at, deleted_at, tenant_id hérités de TenantEntity
}