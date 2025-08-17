import { BaseEntity } from 'src/core/entities/baseEntity';
import {
  Column,
  Entity,
  ManyToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TypeCredit } from '../../../type_credit/entities/typeCredit.entity';

@Entity()
export class TypeGuaranty extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  description: string;

  @ManyToMany(() => TypeCredit, (type) => type.typeGuaranties)
  typeCredits: TypeCredit[];
}
