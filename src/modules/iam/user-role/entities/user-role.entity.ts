// user-role.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { RolePermission } from '../../role-permission/entities/role-permission.entity';

@Entity('user_role')
export class UserRole {
  @PrimaryGeneratedColumn({ unsigned: true, type: 'tinyint' })
  id: number;

  @Column({ length: 20, unique: true })
  code: string;

  @Column({ length: 45 })
  name: string;

  @Column('text', { nullable: true })
  description: string;

  @Column({ name: 'is_system_role', default: false })
  isSystemRole: boolean;

  @CreateDateColumn({ name: 'created_at' })
  create_at: Date;

  @OneToMany(() => RolePermission, (rp) => rp.role)
  permissions: RolePermission[];
  
  @OneToMany(() => RolePermission, (rp) => rp.role)
  rolePermissions: RolePermission[];

  @UpdateDateColumn({ name: 'updated_at' })
  update_at: Date;

  @Column({ type: 'tinyint', nullable: true })
  status: number;
}