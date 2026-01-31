import { Expose } from 'class-transformer';
import { Audience } from 'src/modules/audiences/entities/audience.entity';
import {
    Entity,
    PrimaryGeneratedColumn,
    Column,
    CreateDateColumn,
    UpdateDateColumn,
    OneToMany
} from 'typeorm';


export enum AudienceTypeCategory {
  PRELIMINARY = 'preliminary',
  HEARING = 'hearing',
  JUDGMENT = 'judgment',
  CONCILIATION = 'conciliation',
  EXPERTISE = 'expertise',
  APPEAL = 'appeal',
  CASATION = 'casation'
}

@Entity('audience_types')
export class AudienceType {
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
    enum: AudienceTypeCategory,
    default: AudienceTypeCategory.HEARING
  })
  @Expose()
  category: AudienceTypeCategory;

  @Column({ default: 60 })
  @Expose()
  default_duration_minutes: number;

  @Column({ default: true })
  @Expose()
  is_public: boolean;

  @Column({ default: false })
  @Expose()
  requires_lawyer: boolean;

  @Column({ default: false })
  @Expose()
  allows_remote: boolean;

  @Column({ default: true })
  @Expose()
  is_active: boolean;

  @Column({ type: 'json', nullable: true })
  @Expose()
  metadata: {
    required_documents?: number[];
    preparation_time_days?: number;
    possible_outcomes?: string[];
    legal_basis?: string;
  };

  @OneToMany(() => Audience, audience => audience.audience_type)
  @Expose()
  audiences: Audience[];

  @CreateDateColumn()
  @Expose()
  created_at: Date;

  @UpdateDateColumn()
  @Expose()
  updated_at: Date;
}