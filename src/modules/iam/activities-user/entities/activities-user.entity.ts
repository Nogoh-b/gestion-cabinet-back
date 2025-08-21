// activities-user.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../user/entities/user.entity';

@Entity('activities_user')
export class ActivitiesUser {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ name: 'type_activities_user', length: 45 })
  typeActivities: string;

  @ManyToOne(() => User, { onDelete: 'NO ACTION' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @CreateDateColumn({ name: 'created_at' })
  create_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  update_at: Date;
}