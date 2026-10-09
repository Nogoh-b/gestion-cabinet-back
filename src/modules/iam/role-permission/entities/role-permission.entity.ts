import { TenantEntity } from 'src/core/entities/tenant.entity';
import { Entity, ManyToOne, JoinColumn, Column, PrimaryColumn } from 'typeorm';

import { Permission } from '../../permission/entities/permission.entity';
import { UserRole } from '../../user-role/entities/user-role.entity';

// Isolation stricte par cabinet : les liaisons rôle↔permission sont
// filtrées par WHERE tenant_id = X, comme Permission et UserRole.
// Pas de @SharedAcrossTenants — sinon doublons via IN (1, X).
@Entity('role_permission')
export class RolePermission extends TenantEntity {
  @PrimaryColumn({ unsigned: true, type: 'tinyint' })
  role_id: number;

  @PrimaryColumn({ unsigned: true, type: 'smallint' })
  permission_id: number;

  @ManyToOne(() => UserRole, (role) => role.permissions, {
    onDelete: 'CASCADE',
    eager: true,
  })
  @JoinColumn({ name: 'role_id' })
  role: UserRole;

  @ManyToOne(() => Permission, (permission) => permission.roles, {
    onDelete: 'CASCADE',
    eager: true,
  })
  @JoinColumn({ name: 'permission_id' })
  permission: Permission;

  @Column({ type: 'tinyint', nullable: true })
  status: number;
}
