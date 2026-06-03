import {
  Entity,
  ManyToOne,
  JoinColumn,
  Column,
  PrimaryColumn,
} from 'typeorm';
import { TenantEntity } from 'src/core/entities/tenant.entity';
import { UserRole } from '../../user-role/entities/user-role.entity';
import { Permission } from '../../permission/entities/permission.entity';

@Entity('role_permission')
export class RolePermission extends TenantEntity {
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

  @Column({ type: 'tinyint', nullable: true })
  status: number;
}