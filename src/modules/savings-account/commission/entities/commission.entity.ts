import { BaseEntity } from 'src/core/entities/base.entity';
import { Entity, Column } from 'typeorm';

@Entity('commission')
export class Commission extends BaseEntity {
  @Column({ primary: true, generated: true })
  id: number;

  @Column({ length: 100 })
  description: string;

  @Column({ type: 'enum', enum: ['Fixé', 'Variable'] })
  type_valeur: string;

  @Column({ nullable: true })
  montant: number;
}