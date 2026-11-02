import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { TenantEntity } from 'src/core/entities/tenant.entity';
import { User } from 'src/modules/iam/user/entities/user.entity';
import { Dossier } from './dossier.entity';

export enum DossierMemberRole {
  RESPONSIBLE = 'RESPONSIBLE',
  LAWYER = 'LAWYER',
  COLLABORATOR = 'COLLABORATOR',
  OBSERVER = 'OBSERVER',
}

@Entity('dossier_members')
@Unique(['tenant_id', 'dossierId', 'userId'])
@Index(['tenant_id', 'userId', 'revokedAt'])
export class DossierMember extends TenantEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'dossier_id', type: 'int' })
  dossierId: number;

  @ManyToOne(() => Dossier, (dossier) => dossier.members, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'dossier_id' })
  dossier: Dossier;

  @Column({ name: 'user_id', type: 'int' })
  userId: number;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ type: 'enum', enum: DossierMemberRole })
  role: DossierMemberRole;

  @Column({ name: 'confidentiality_level', type: 'tinyint', default: 0 })
  confidentialityLevel: number;

  @Column({ name: 'valid_from', type: 'datetime', default: () => 'CURRENT_TIMESTAMP' })
  validFrom: Date;

  @Column({ name: 'valid_until', type: 'datetime', nullable: true })
  validUntil: Date | null;

  @Column({ name: 'revoked_at', type: 'datetime', nullable: true })
  revokedAt: Date | null;

  @Column({ name: 'revoked_by', type: 'int', nullable: true })
  revokedBy: number | null;
}
