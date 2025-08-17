import { BaseEntity } from 'src/core/entities/baseEntity';
import {
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TypeGuaranty } from '../../type_guaranty/entity/type_guaranty.entity';
import { DocumentType } from '../../../../documents/document-type/entities/document-type.entity';
import { Loan } from '../../../loan/entities/loan.entity';
import { CREDIT_STATUS } from 'src/utils/types';

@Entity()
export class GuarantyEstimation extends BaseEntity {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  value: number;

  @Column()
  status: CREDIT_STATUS;

  @OneToOne(() => TypeGuaranty)
  @JoinColumn()
  typeGuaranty: TypeGuaranty;

  @ManyToOne(() => Loan, (type) => type.guaranties)
  @JoinColumn()
  loan: Loan;

  @OneToOne(() => DocumentType)
  @JoinColumn()
  documents: DocumentType;
}
