import { BaseEntity } from 'src/core/entities/base.entity';
import { User } from 'src/modules/iam/user/entities/user.entity';
import {
  Column,
  ManyToOne,
  JoinColumn,
  Entity,
  OneToOne,
  BeforeInsert,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

import { Branch } from '../../branch/entities/branch.entity';

@Entity('employee')
export class Employee extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number; // sera égal à user.id

  @OneToOne(() => User, user => user.employee)
  @JoinColumn({ name: 'user_id' }) // Clé étrangère et clé primaire en même temps
  user: User;

  @ManyToOne(() => Branch)
  @JoinColumn({ name: 'branch_id'})
  branch?: Branch;

  /*@ApiProperty({ enum: EmployeePosition })
  @Column({ type: 'enum', enum: EmployeePosition })
  position: EmployeePosition;*/

  @ApiProperty({ example: '2023-01-01' })
  @Column({ type: 'date', name: 'hire_date' })
  hireDate: Date;



  @ApiProperty({ example: 1 })
  @Column({ type: 'tinyint' })
  status: number;


  @BeforeInsert()
  setDefaultHireDate() {
    console.log(
      'Aucune date de naissance spécifiée, utilisation de la date actuelle',
    );
    if (!this.hireDate) {
      this.hireDate = new Date(); // Valeur par défaut
    }
  }
}