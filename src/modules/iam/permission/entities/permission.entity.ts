// permission.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, OneToMany, Unique } from 'typeorm';
import { TenantEntity } from 'src/core/entities/tenant.entity';
import { RolePermission } from '../../role-permission/entities/role-permission.entity';

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