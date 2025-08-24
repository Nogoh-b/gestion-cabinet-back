// user.entity.ts
import { Exclude } from 'class-transformer';
import { Employee } from 'src/modules/agencies/employee/entities/employee.entity';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, OneToMany, OneToOne } from 'typeorm';

import { UserRoleAssignment } from '../../user-role-assignment/entities/user-role-assignment.entity';
import { Loan } from '../../../credit/loan/entities/loan.entity';


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

  @Column({ length: 200, nullable: true })
  refreshToken: string;

  @Exclude()
  @Column({ type: 'char', length: 60 })
  password: string;

  @OneToMany(() => UserRoleAssignment, (assignment) => assignment.user)
  roleAssignments: UserRoleAssignment[];

  @OneToMany(() => Loan, (type) => type.initiated)
  loanInit: Loan[];

  @OneToMany(() => Loan, (type) => type.managedBy)
  loanManage: Loan[];

  @OneToMany(() => Loan, (type) => type.approvedBy)
  loanApproved: Loan[];

  @OneToOne(() => Employee, (employee) => employee.user, {
    cascade: true,
    eager: true,
  })
  @JoinColumn() // This side owns the relationship (has the foreign key)
  employee: Employee;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer ?: Customer;

  @CreateDateColumn({ name: 'created_at' })
  create_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  update_at: Date;
}