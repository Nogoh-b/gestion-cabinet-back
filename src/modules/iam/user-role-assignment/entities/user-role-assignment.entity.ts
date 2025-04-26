import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { User } from '../../user/entities/user.entity';
import { UserRole } from '../../user-role/entities/user-role.entity';

@Entity({ name: 'user_role_assignment', schema: 'core_banking' })
export class UserRoleAssignment {
  @PrimaryColumn({ name: 'user_id', type: 'int' })
  userId: number;

  @PrimaryColumn({ name: 'role_id', type: 'tinyint', unsigned: true })
  roleId: number;

  @Column({ name: 'assigned_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  assignedAt: Date;

  @Column({ name: 'assigned_by', type: 'int', nullable: true, comment: 'User qui a attribué le rôle' })
  assignedBy?: number;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @Column({ type: 'tinyint', nullable: true })
  status?: number;

  @ManyToOne(() => User, (user) => user.roleAssignments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @ManyToOne(() => UserRole, (role) => role.assignments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role: UserRole;
}
