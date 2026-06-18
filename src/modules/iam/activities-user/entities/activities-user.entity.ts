// activities-user.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { TenantEntity } from 'src/core/entities/tenant.entity';

@Entity('activities_user')
export class ActivitiesUser extends TenantEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'type_activities_user', length: 45 })
  typeActivities: string;

  @ManyToOne(() => User, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  // created_at, updated_at, deleted_at, tenant_id hérités de TenantEntity
}