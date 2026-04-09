import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    OneToMany,
    ManyToOne,
    JoinColumn
} from 'typeorm';
import { Expose } from 'class-transformer';
import { Audience } from 'src/modules/audiences/entities/audience.entity';

export enum JurisdictionLevel {
  MUNICIPAL = 'municipal',
  REGIONAL = 'regional',
  NATIONAL = 'national',
  INTERNATIONAL = 'international'
}

export enum JurisdictionType {
  CIVIL = 'civil',
  COMMERCIAL = 'commercial',
  ADMINISTRATIVE = 'administrative',
  PENAL = 'penal',
  LABOR = 'labor',
  FAMILY = 'family'
}

@Entity('jurisdictions')
export class Jurisdiction {
  @PrimaryGeneratedColumn()
  @Expose()
  id: number;

  @Column({ unique: true })
  @Expose()
  code: string;

  @Column()
  @Expose()
  name: string;

  @Column({ type: 'text', nullable: true })
  @Expose()
  description: string;

  @Column({
    type: 'enum',
    enum: JurisdictionLevel,
    default: JurisdictionLevel.REGIONAL
  })
  @Expose()
  level: JurisdictionLevel;

  @Column({
    type: 'enum',
    enum: JurisdictionType,
    default: JurisdictionType.CIVIL
  })
  @Expose()
  jurisdiction_type: JurisdictionType;

  @Column({ nullable: true })
  @Expose()
  city: string;

  @Column({ nullable: true })
  @Expose()
  region: string;

  @Column({ default: 'France' })
  @Expose()
  country: string;

  @Column({ nullable: true })
  @Expose()
  address: string;

  @Column({ nullable: true })
  @Expose()
  phone: string;

  @Column({ nullable: true })
  @Expose()
  email: string;

  @Column({ nullable: true })
  @Expose()
  website: string;

  @Column({ name: 'parent_id', nullable: true })
  parent_id: number;

  @ManyToOne(() => Jurisdiction, { nullable: true })
  @JoinColumn({ name: 'parent_id' })
  @Expose()
  parent_jurisdiction: Jurisdiction;

  @OneToMany(() => Audience, audience => audience.jurisdiction)
  @Expose()
  audiences: Audience[];

  @Column({ default: true })
  @Expose()
  is_active: boolean;

  @Column({ type: 'json', nullable: true })
  @Expose()
  metadata: {
    timezone?: string;
    working_hours?: string[];
    holidays?: string[];
    court_number?: string;
    judge_name?: string;
  };

  @CreateDateColumn()
  @Expose()
  created_at: Date;

  @UpdateDateColumn()
  @Expose()
  updated_at: Date;

  @Column({ nullable: true })
  @Expose()
  created_by: number;

  @Column({ nullable: true })
  @Expose()
  updated_by: number;
}