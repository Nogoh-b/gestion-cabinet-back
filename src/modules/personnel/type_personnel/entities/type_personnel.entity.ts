import { BaseEntity } from 'src/core/entities/baseEntity';
import { Entity, Column, PrimaryGeneratedColumn, OneToMany } from 'typeorm';



import { Personnel } from '../../personnel/entities/personnel.entity';


export enum PersonnelTypeCode {
  COMMERCIAL = 'COMMERCIAL',
  PARTNER = 'PARTNER',
  PCA = 'PCA',
  DG = 'DG',
  MEMBRE = 'MEMBRE'
}

@Entity('type_personnel')
export class TypePersonnel extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  title: string;

  @Column({ type: 'int', default: 0 })
  max_transaction_blocked: number;

  @Column({ length: 10, unique: true })
  code: string;

  @OneToMany(() => Personnel, personnel => personnel.type_personnel)
  personnels: Personnel[];
}