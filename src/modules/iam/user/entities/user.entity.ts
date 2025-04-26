import { BaseEntity } from 'src/core/entities/base.entity';
import { Entity, Column, OneToMany, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { UserRoleAssignment } from '../../user-role-assignment/entities/user-role-assignment.entity';

@Entity('user')
export class User extends BaseEntity {
  @PrimaryGeneratedColumn({ type: 'int' })
  id: number; // <== IMPORTANT
  @Column({ unique: true })
  email: string;
  @Column({ nullable: true })
  username: string;

  @Column({ type: 'char', length: 60, nullable: true })
  password: string;

  @Column({ nullable: true })
  codeOtp: string;

  @Column({ nullable: true })
  status: string;

  @Column({ nullable: true, default: 'caisse, comptable, DG,DAF, PCA' })
  type: string;

  @Column({ nullable: true })
  customer_id: number;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;

  @OneToMany(() => UserRoleAssignment, (assignment) => assignment.user)
  roleAssignments: UserRoleAssignment[];
}
