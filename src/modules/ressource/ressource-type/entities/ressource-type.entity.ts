import { ApiProperty } from "@nestjs/swagger";
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from "typeorm";

@Entity()
export class RessourceType {
  @PrimaryGeneratedColumn()
  @ApiProperty()
  id: number;

  @Column()
  @ApiProperty({ example: 'Carnet de chèque' })
  name: string;

  @Column()
  @ApiProperty({ example: 'CARNET' })
  code: string;

  @Column({ nullable: true })
  @ApiProperty({ required: false })
  swift_code: string;

  @Column({ nullable: true })
  @ApiProperty({ required: false })
  bank_code: string;

  @Column({ nullable: true })
  @ApiProperty({ required: false })
  account_number: string;

  @Column({ nullable: true })
  @ApiProperty({ required: false })
  key: string;

  @Column({ nullable: true })
  @ApiProperty({ required: false })
  iban: string;

  @Column({ nullable: true })
  @ApiProperty({ required: false })
  account_label: string;

  @CreateDateColumn()
  @ApiProperty()
  created_at: Date;

  @UpdateDateColumn()
  @ApiProperty()
  updated_at: Date;
}
