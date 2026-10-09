// permission.entity.ts
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
// permissions (WHERE tenant_id = X). Pas de @SharedAcrossTenants ici —
// sinon les lectures retournent tenant_id IN (1, X) et chaque permission
// apparaît en double (ligne globale 1 + copie locale X).
@Entity('permission')
@Unique(['code', 'tenant_id'])
export class Permission extends TenantEntity {
  @PrimaryGeneratedColumn({ unsigned: true, type: 'smallint' })
  id: number;

  @Column({ length: 50 })
  code: string;

  @Column('text', { nullable: true })
  description: string;

  @Column({ type: 'tinyint', nullable: true, default: 1 })
  canChange: number;

  @OneToMany(() => RolePermission, (rp) => rp.permission)
  roles: RolePermission[];

  @Column({ type: 'tinyint', nullable: true })
  status: number;
}
