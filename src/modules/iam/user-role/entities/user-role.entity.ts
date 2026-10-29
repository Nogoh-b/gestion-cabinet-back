import {
  BusinessColumn,
  BusinessTable,
} from 'src/core/decorators/business-metadata.decorator';
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
// Consultation seulement : les rôles se gèrent dans Paramètres > Rôles.
@BusinessTable({
  label: "Rôles (profils d'accès)",
  description:
    "Profils d'accès du cabinet : nom, description, rôle de base, rôle système. Droits d'un rôle : role_permission + permission.",
  category: 'iam',
  readOnly: true,
})
export class UserRole extends TenantEntity {
  @PrimaryGeneratedColumn({ unsigned: true, type: 'int' })
  @BusinessColumn({
    label: 'Identifiant',
    description: 'Non exposé',
    importance: 'low',
    ignored: true,
  })
  id: number;

  @Column({ length: 64 })
  code: string;

  @Column({ length: 30, default: 'collaborateur' })
  base_role: string;

  @Column({ length: 150 })
  @BusinessColumn({
    label: 'Nom du rôle',
    description: "Nom du profil d'accès",
    importance: 'critical',
  })
  name: string;

  @Column('text', { nullable: true })
  @BusinessColumn({ label: 'Description', description: 'Description du rôle' })
  description: string;

  @Column({ name: 'is_system_role', default: false })
  @BusinessColumn({
    label: 'Rôle système',
    description: 'Rôle fourni par défaut',
  })
  isSystemRole: boolean;

  @OneToMany(() => RolePermission, (rp) => rp.role)
  permissions: RolePermission[];

  @OneToMany(() => RolePermission, (rp) => rp.role)
  rolePermissions: RolePermission[];

  @Column({ type: 'tinyint', nullable: true })
  status: number;
}
