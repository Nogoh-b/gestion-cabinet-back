import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, BaseEntity } from 'typeorm';
import { UserRole } from '../../user-role/entities/user-role.entity';
import { Permission } from '../../permission/entities/permission.entity';

@Entity({ name: 'role_permission', schema: 'core_banking' })
export class RolePermission extends BaseEntity {
  @PrimaryColumn({ name: 'role_id', type: 'tinyint', unsigned: true })
  roleId: number;

  @PrimaryColumn({ name: 'permission_id', type: 'smallint', unsigned: true })
  permissionId: number;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @Column({ type: 'tinyint', nullable: true })
  status?: number;

  @ManyToOne(() => UserRole, (role) => role.rolePermissions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'role_id' })
  role: UserRole;

  @ManyToOne(() => Permission, (permission) => permission.rolePermissions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'permission_id' })
  permission: Permission;
}
