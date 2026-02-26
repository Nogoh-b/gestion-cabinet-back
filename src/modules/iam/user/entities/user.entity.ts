// user.entity.ts
import { Exclude, Expose } from 'class-transformer';
import { UserRole } from 'src/core/enums/user-role.enum';
import { Employee } from 'src/modules/agencies/employee/entities/employee.entity';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';

import { Dossier } from 'src/modules/dossiers/entities/dossier.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, OneToMany, OneToOne } from 'typeorm';


import { UserRoleAssignment } from '../../user-role-assignment/entities/user-role-assignment.entity';
import { Finding } from 'src/modules/finding/entities/finding.entity';
import { Diligence } from 'src/modules/diligence/entities/diligence.entity';




@Entity('user')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 45, unique: true })
  username: string;

  @Column({ type: 'tinyint' })
  status: number;

  @Column({ length: 45, nullable: true })
  email: string;

  @Column({ length: 100, nullable: true })
  fcmToken: string;

  @Column({ length: 200, nullable: true })
  refreshToken: string;

  @Exclude()
  @Column({ type: 'char', length: 60 })
  password: string;

  @OneToMany(() => UserRoleAssignment, (assignment) => assignment.user)
  roleAssignments: UserRoleAssignment[];

  @Column({ 
    type: 'enum', 
    enum: UserRole, 
    default: UserRole.AVOCAT 
  })
 @Column({ 
    type: 'enum', 
    enum: UserRole, 
    default: UserRole.AVOCAT 
  })

  role: UserRole; // ✅ Propriété role ajoutée
 
  @OneToOne(() => Employee, (employee) => employee.user, {
    cascade: true,
    eager: true,
  })
  @JoinColumn() // This side owns the relationship (has the foreign key)
  employee: Employee;
  @Column({ name: 'last_name', length: 45, nullable: false })
  last_name: string;

  @Column({ name: 'first_name', length: 45, nullable: false })
  first_name: string;

  @Column({ name: 'is_online', default: true })
  is_online: boolean;

  @Column({ name: 'lastSeen', default: true })
  lastSeen: Date;

  @ManyToOne(() => Customer, { nullable: true })
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @CreateDateColumn({ name: 'created_at' })
  create_at: Date;

  @OneToMany(() => Dossier, (dossier) => dossier.lawyer)
  managed_dossiers: Dossier[];
  @OneToMany(() => Diligence, (diligence) => diligence.assigned_lawyer)
  assigned_diligences: Diligence[];

  @OneToMany(() => Finding, (finding) => finding.created_by)
  created_findings: Finding[];

  @OneToMany(() => Finding, (finding) => finding.validated_by)
  validated_findings: Finding[];

  @UpdateDateColumn({ name: 'updated_at' })
  update_at: Date;

    // Getters
  @Expose()
  get full_name(): string {
    return `${this.first_name} ${this.last_name}`;
  }
  get specialization(): string | null {
    return this.employee?.specialization || null;
  }
}