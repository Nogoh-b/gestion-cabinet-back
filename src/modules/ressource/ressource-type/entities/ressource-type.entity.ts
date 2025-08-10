import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";






@Entity()
export class RessourceType {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  description: string;

  @Column()
  name: string;

  @Column()
  amount: number; 
   
  @Column()
  quantity: number;

  @Column()
  code: string;

  @Column({ nullable: true })
  swift_code: string;

  @Column({ nullable: true })
  bank_code: string;

  @Column({ nullable: true })
  account_number: string;

  @Column({ nullable: true })
  key: string;

  @Column({ nullable: true })
  iban: string;

  @Column({ nullable: true })
  account_label: string;
  @Column({ nullable: true, length: 20 })
  branch_code: string;

  @Column({ nullable: true, length: 10 })
  country_code: string;
  @CreateDateColumn()
  created_at: Date;

  @UpdateDateColumn()
  updated_at: Date;
}
