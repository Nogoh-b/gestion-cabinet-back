import { Column, Entity, PrimaryColumn } from "typeorm";



// Entité Sequence
@Entity()
export class Sequence {
  @PrimaryColumn({ type: 'date' })
  date: Date;

  @Column({ default: 0 })
  value: number;
}
