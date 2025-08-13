import { Base } from 'src/core/entities/base';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TypeCredit } from '../../../type_credit/entities/typeCredit.entity';
import { DocumentType } from '../../../../documents/document-type/entities/document-type.entity';

@Entity()
export class TypeGuaranty extends Base {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  name: string;

  @Column()
  description: string;

  @ManyToMany(() => TypeCredit, (type) => type.typeGuaranties)
  typeCredits: TypeCredit[];
}
