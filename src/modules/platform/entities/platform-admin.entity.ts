import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Exclude } from 'class-transformer';

export const PLATFORM_ROLES = ['owner', 'finance', 'support'] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];
export type PlatformAdminStatus = 'active' | 'disabled';

/**
 * Administrateur de la PLATEFORME (propriétaire du SaaS, finance, support).
 *
 * Totalement distinct des utilisateurs de cabinet (`user`) : table propre,
 * connexion propre (`/platform/auth`), jeton signé avec PLATFORM_JWT_SECRET.
 * Entité AU NIVEAU PLATEFORME (pas de `tenant_id`).
 */
@Entity('platform_admins')
export class PlatformAdmin {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'varchar', length: 150, unique: true })
  email: string;

  @Column({ type: 'varchar', length: 150, name: 'full_name' })
  full_name: string;

  /** Hash bcrypt. NULL tant que l'invitation n'a pas été acceptée. */
  @Exclude()
  @Column({ type: 'varchar', length: 100, nullable: true, select: false })
  password: string | null;

  @Column({ type: 'enum', enum: PLATFORM_ROLES, default: 'support' })
  role: PlatformRole;

  @Column({ type: 'enum', enum: ['active', 'disabled'], default: 'active' })
  status: PlatformAdminStatus;

  /** Incrémenté à la déconnexion / changement de mot de passe → révoque les jetons. */
  @Exclude()
  @Column({ type: 'int', name: 'token_version', default: 0 })
  token_version: number;

  @Exclude()
  @Column({ type: 'int', name: 'failed_attempts', default: 0 })
  failed_attempts: number;

  @Column({ type: 'datetime', name: 'locked_until', nullable: true })
  locked_until: Date | null;

  @Column({ type: 'datetime', name: 'last_login_at', nullable: true })
  last_login_at: Date | null;

  @Column({ type: 'varchar', length: 64, name: 'last_login_ip', nullable: true })
  last_login_ip: string | null;

  @Column({ type: 'int', name: 'created_by_admin_id', nullable: true })
  created_by_admin_id: number | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updated_at: Date;
}
