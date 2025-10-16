import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';


import { ApiProperty } from '@nestjs/swagger';






import { RessourceType } from '../../ressource-type/entities/ressource-type.entity';











@Entity()
export class Ressource {
  @PrimaryGeneratedColumn()
  @ApiProperty()
  id: number;

  @Column()
  @ApiProperty({ example: 1 })
  ressource_type_id: number;

  @Column()
  @ApiProperty({ example: 5 })
  savings_account_id: number;

  @ManyToOne(() => RessourceType)
  @JoinColumn({ name: 'ressource_type_id' })
  ressource_type: RessourceType;

  

  @Column({ default: 1 })
  @ApiProperty({ example: 1 })
  status: number;


  
  @Column({ nullable: true, default: 1 })
  quantity: number;
  @CreateDateColumn()
  @ApiProperty()
  created_at: Date;
} 