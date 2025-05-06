import { Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Entity } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { LocationCity } from 'src/modules/geography/location_city/entities/location_city.entity';

@Entity('branch')
export class Branch {
  @ApiProperty()
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ example: 'BR-001' })
  @Column({ length: 10, unique: true })
  code: string;

  @ApiProperty({ example: 'Agence Principale' })
  @Column({ length: 100 })
  name: string;

  @ManyToOne(() => LocationCity)
  @JoinColumn({ name: 'location_city_id' })
  location_city: LocationCity;

  @ApiProperty({ example: '2023-01-01' })
  @Column({ type: 'date', name: 'opening_date' })
  openingDate: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP', onUpdate: 'CURRENT_TIMESTAMP' })
  updatedAt: Date;

  @ApiProperty({ example: 1 })
  @Column({ type: 'tinyint' })
  status: number;
}