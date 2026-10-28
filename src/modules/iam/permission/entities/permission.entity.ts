import {
  BusinessColumn,
  BusinessTable,
} from 'src/core/decorators/business-metadata.decorator';
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
@BusinessTable({
  label: 'Droits',
  description:
    "Droits de l'application : code technique et description lisible (à afficher à l'utilisateur).",
  category: 'iam',
  readOnly: true,
})
export class Permission extends TenantEntity {
  @PrimaryGeneratedColumn({ unsigned: true, type: 'int' })
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  id: number;

  @Column({ length: 50 })
  @BusinessColumn({
    label: 'Code du droit',
    description: 'Code technique du droit',
  })
  code: string;

  @Column('text', { nullable: true })
  @BusinessColumn({
    label: 'Droit',
    description: 'Libellé lisible du droit',
    importance: 'critical',
  })
  description: string;

  @Column({ type: 'tinyint', nullable: true, default: 1 })
  @BusinessColumn({
    label: 'Modifiable',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  canChange: number;

  @OneToMany(() => RolePermission, (rp) => rp.permission)
  roles: RolePermission[];

  @Column({ type: 'tinyint', nullable: true })
  status: number;
}
