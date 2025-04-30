// permission.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { RolePermission } from '../../role-permission/entities/role-permission.entity';

@Entity('permission')
export class Permission {
  @PrimaryGeneratedColumn({ unsigned: true, type: 'smallint' })
  id: number;

  @Column({ length: 50, unique: true })
  code: string;

  @Column('text', { nullable: true })
  description: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @OneToMany(() => RolePermission, (rp) => rp.permission)
  roles: RolePermission[];

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @Column({ type: 'tinyint', nullable: true })
  status: number;
}