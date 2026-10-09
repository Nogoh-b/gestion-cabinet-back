// user-role.entity.ts
import { TenantEntity } from 'src/core/entities/tenant.entity';
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  Unique,
} from 'typeorm';

import { RolePermission } from '../../role-permission/entities/role-permission.entity';

// Isolation stricte par cabinet : chaque tenant ne voit QUE ses propres
// rôles (WHERE tenant_id = X). Pas de @SharedAcrossTenants ici —
// sinon les lectures retournent tenant_id IN (1, X) et chaque rôle
// (secretaire, avocat, …) apparaît en double.
@Entity('user_role')
@Unique(['code', 'tenant_id'])
export class UserRole extends TenantEntity {
  @PrimaryGeneratedColumn({ unsigned: true, type: 'tinyint' })
  id: number;

  @Column({ length: 20 })
  code: string;

  @Column({ length: 45 })
  name: string;

  @Column('text', { nullable: true })
  description: string;

  @Column({ name: 'is_system_role', default: false })
  isSystemRole: boolean;

  @OneToMany(() => RolePermission, (rp) => rp.role)
  permissions: RolePermission[];

  @OneToMany(() => RolePermission, (rp) => rp.role)
  rolePermissions: RolePermission[];

  @Column({ type: 'tinyint', nullable: true })
  status: number;
}
