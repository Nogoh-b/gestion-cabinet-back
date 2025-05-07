import { Column, ManyToOne, JoinColumn, Entity, OneToOne, PrimaryColumn } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { Branch } from '../../branch/entities/branch.entity';
import { User } from 'src/modules/iam/user/entities/user.entity';
@Entity('employee')
export class Employee {
  @PrimaryColumn()
  id: number; // sera égal à user.id

  @OneToOne(() => User, user => user.employee)
  @JoinColumn({ name: 'id' }) // Clé étrangère et clé primaire en même temps
  user: User;

  @ManyToOne(() => Branch)
  @JoinColumn({ name: 'branch_id' })
  branch: Branch;

  /*@ApiProperty({ enum: EmployeePosition })
  @Column({ type: 'enum', enum: EmployeePosition })
  position: EmployeePosition;*/

  @ApiProperty({ example: '2023-01-01' })
  @Column({ type: 'date', name: 'hire_date' })
  hireDate: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  @ApiProperty({ example: 1 })
  @Column({ type: 'tinyint' })
  status: number;
}