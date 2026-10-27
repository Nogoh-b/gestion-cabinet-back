import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export type PlatformTokenPurpose = 'login_otp' | 'invite' | 'reset_password';

/**
 * Jetons à usage unique des admins plateforme : défi OTP de connexion,
 * invitation (définition du mot de passe), réinitialisation.
 * Seuls des HMAC sont stockés (jamais le jeton ni le code en clair).
 */
@Entity('platform_admin_tokens')
@Index('IDX_platform_admin_tokens_hash', ['token_hash'])
export class PlatformAdminToken {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ type: 'int', name: 'admin_id' })
  admin_id: number;

  @Column({
    type: 'enum',
    enum: ['login_otp', 'invite', 'reset_password'],
  })
  purpose: PlatformTokenPurpose;

  @Column({ type: 'varchar', length: 64, name: 'token_hash' })
  token_hash: string;

  /** Code OTP (login_otp uniquement). */
  @Column({ type: 'varchar', length: 64, name: 'code_hash', nullable: true })
  code_hash: string | null;

  @Column({ type: 'int', default: 0 })
  attempts: number;

  @Column({ type: 'datetime', name: 'expires_at' })
  expires_at: Date;

  @Column({ type: 'datetime', name: 'consumed_at', nullable: true })
  consumed_at: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ip: string | null;

  @CreateDateColumn({ name: 'created_at' })
  created_at: Date;
}
