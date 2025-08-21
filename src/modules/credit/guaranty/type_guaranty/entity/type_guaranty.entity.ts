import { BaseEntity } from 'src/core/entities/baseEntity';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToMany,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TypeCredit } from '../../../type_credit/entities/typeCredit.entity';
import { GuarantyEstimation } from '../../garanty_estimation/entity/guaranty_estimation.entity';
import { DocumentType } from '../../../../documents/document-type/entities/document-type.entity';

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

  @OneToMany(() => GuarantyEstimation, (type) => type.typeGuaranty)
  guaranties: GuarantyEstimation[];

  @OneToOne(() => DocumentType)
  @JoinColumn()
  typeOfDocument: DocumentType;
}
