import {
  Entity,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Column,
  PrimaryColumn,
} from 'typeorm';
import { UserRole } from '../../user-role/entities/user-role.entity';
import { Permission } from '../../permission/entities/permission.entity';

@Entity('role_permission')
export class RolePermission {
  @PrimaryColumn({ unsigned: true, type: 'tinyint' })
  role_id: number;

  @PrimaryColumn({ unsigned: true, type: 'smallint' })
  permission_id: number;

  @ManyToOne(() => UserRole, (role) => role.permissions, { 
    onDelete: 'CASCADE',
    eager: true 
  })
  @JoinColumn({ name: 'role_id' })
  role: UserRole;

  @ManyToOne(() => Permission, (permission) => permission.roles, { 
    onDelete: 'CASCADE',
    eager: true 
  })
  @JoinColumn({ name: 'permission_id' })
  permission: Permission;

  @CreateDateColumn({ name: 'created_at' })
  create_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  update_at: Date;

  @Column({ type: 'tinyint', nullable: true })
  status: number;
}