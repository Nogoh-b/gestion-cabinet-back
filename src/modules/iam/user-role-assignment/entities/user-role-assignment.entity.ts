// user-role-assignment.entity.ts
import {
  Entity,
  ManyToOne,
  JoinColumn,
  Column,
  PrimaryColumn,
} from 'typeorm';
import { TenantEntity } from 'src/core/entities/tenant.entity';
import { UserRole } from '../../user-role/entities/user-role.entity';
import { User } from '../../user/entities/user.entity';

@Entity('user_role_assignment')
export class UserRoleAssignment extends TenantEntity {


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

  @Column({ type: 'tinyint', nullable: true })
  status: number;
}