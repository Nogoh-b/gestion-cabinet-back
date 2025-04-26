import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { UserRoleAssignment } from '../../user-role-assignment/entities/user-role-assignment.entity';
import { RolePermission } from '../../role-permission/entities/role-permission.entity';

@Entity({ name: 'user_role', schema: 'core_banking' })
export class UserRole {
  @PrimaryGeneratedColumn({ type: 'tinyint', unsigned: true })
  id: number;

  @Column({ type: 'varchar', length: 20, unique: true })
  code: string;

  @Column({ type: 'varchar', length: 45 })
  name: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'tinyint', default: false, nullable: true })
  isSystemRole?: boolean;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @Column({ type: 'tinyint', nullable: true })
  status?: number;

  @OneToMany(() => UserRoleAssignment, (assignment) => assignment.role)
  assignments: UserRoleAssignment[];

  @OneToMany(() => RolePermission, (rolePermission) => rolePermission.role)
  rolePermissions: RolePermission[];
}
