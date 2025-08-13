import { Base } from 'src/core/entities/base';
import {
  Column,
  Entity,
  JoinColumn, ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { TypeGuaranty } from '../../type_guaranty/entity/type_guaranty.entity';
import { DocumentType } from '../../../../documents/document-type/entities/document-type.entity';
import { Credit } from '../../../credit/entities/credit.entity';

@Entity()
export class GuarantyEstimation extends Base {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  value: number;

  @OneToOne(() => TypeGuaranty)
  @JoinColumn()
  typeGuaranty: TypeGuaranty;

  @ManyToOne(() => Credit, (type) => type.guaranties)
  @JoinColumn()
  credit: Credit;

  @OneToOne(() => DocumentType)
  @JoinColumn()
  documents: DocumentType;
}
