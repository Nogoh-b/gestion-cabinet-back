// user-role-assignment.entity.ts
import {
  Entity,
  ManyToOne,
  JoinColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  PrimaryColumn,
} from 'typeorm';
import { UserRole } from '../../user-role/entities/user-role.entity';
import { User } from '../../user/entities/user.entity';

@Entity('user_role_assignment')
export class UserRoleAssignment {

  
  @PrimaryColumn({ type: 'int' })
  user_id: number;

  @PrimaryColumn({ unsigned: true, type: 'tinyint' })
  role_id: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => UserRole, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role: UserRole;

  @Column({ name: 'assigned_at', default: () => 'CURRENT_TIMESTAMP' })
  assigned_at: Date;

  @Column({ name: 'assigned_by', nullable: true })
  assigned_by: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ type: 'tinyint', nullable: true })
  status: number;
}