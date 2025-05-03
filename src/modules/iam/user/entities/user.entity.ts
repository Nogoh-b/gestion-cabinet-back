// user.entity.ts
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { UserRoleAssignment } from '../../user-role-assignment/entities/user-role-assignment.entity';
import { Exclude } from 'class-transformer';

@Entity('user')
export class User {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ length: 45, unique: true })
  username: string;

  @Column({  type:'tinyint' })
  status: number;
  
  @Column({ length: 45 })
  email: string;  

  @Column({ length: 200 })
  refreshToken: string;


  @Exclude()
  @Column({ type: 'char', length: 60 })
  password: string;

  @OneToMany(() => UserRoleAssignment, assignment => assignment.user)
  roleAssignments: UserRoleAssignment[];

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer: Customer;

  @CreateDateColumn({ name: 'created_at' })
  create_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  update_at: Date;
}