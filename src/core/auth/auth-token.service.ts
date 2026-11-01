import {
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  LessThan,
  MoreThan,
  Repository,
} from 'typeorm';
import { randomBytes, randomInt, timingSafeEqual, createHash } from 'crypto';
import * as bcrypt from 'bcrypt';
import { AuthToken } from './entities/auth-token.entity';

export type AuthTokenType = 'reset_password' | 'set_password' | 'mfa';

const OTP_EXPIRY_MINUTES = 10;
const OTP_COOLDOWN_MS = 60_000;
const OTP_MAX_PER_HOUR = 5;
const OTP_MAX_FAILURES = 5;

@Injectable()
export class AuthTokenService {
  constructor(
    @InjectRepository(AuthToken)
    private readonly authTokenRepository: Repository<AuthToken>,
    private readonly dataSource: DataSource,
  ) {}

  generateOTP(): string {
    return randomInt(100000, 1_000_000).toString();
  }

  generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  async createOTP(
    email: string,
    type: AuthTokenType,
  ): Promise<{ otp: string; expiresAt: Date }> {
    const normalizedEmail = email.trim().toLowerCase();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const [recentCount, latest] = await Promise.all([
      this.authTokenRepository.count({
        where: {
          email: normalizedEmail,
          type,
          createdAt: MoreThan(oneHourAgo),
        },
      }),
      this.authTokenRepository.findOne({
        where: { email: normalizedEmail, type },
        order: { createdAt: 'DESC' },
      }),
    ]);
    if (recentCount >= OTP_MAX_PER_HOUR) {
      throw new HttpException(
        'Trop de codes demandés. Réessayez dans une heure.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    if (
      latest?.createdAt &&
      Date.now() - latest.createdAt.getTime() < OTP_COOLDOWN_MS
    ) {
      throw new HttpException(
        'Un code vient déjà d’être envoyé. Patientez une minute.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    await this.authTokenRepository.update(
      { email: normalizedEmail, type, isUsed: false },
      { isUsed: true },
    );
    const otp = this.generateOTP();
    const expiresAt = new Date(Date.now() + OTP_EXPIRY_MINUTES * 60_000);
    await this.authTokenRepository.save(
      this.authTokenRepository.create({
        email: normalizedEmail,
        otp: await bcrypt.hash(otp, 10),
        type,
        expiresAt,
        isUsed: false,
        failedAttempts: 0,
        lastAttemptAt: null,
        token: null,
      }),
    );
    return { otp, expiresAt };
  }

  async createResetToken(
    email: string,
    type: AuthTokenType,
  ): Promise<string> {
    const token = this.generateToken();
    await this.authTokenRepository.save(
      this.authTokenRepository.create({
        email: email.trim().toLowerCase(),
        token: this.hashToken(token),
        type,
        expiresAt: new Date(Date.now() + 15 * 60_000),
        isUsed: false,
        failedAttempts: 0,
        lastAttemptAt: null,
        otp: null,
      }),
    );
    return token;
  }

  async verifyOTP(
    email: string,
    otp: string,
    type: AuthTokenType,
    issueContinuation = true,
  ): Promise<{ isValid: boolean; token?: string }> {
    const normalizedEmail = email.trim().toLowerCase();
    const isValid = await this.dataSource.transaction(
      'SERIALIZABLE',
      async (manager) => {
        const repository = manager.getRepository(AuthToken);
        const record = await repository.findOne({
          where: {
            email: normalizedEmail,
            type,
            isUsed: false,
          },
          order: { createdAt: 'DESC' },
          lock: { mode: 'pessimistic_write' },
        });
        if (!record || !record.otp) return false;
        if (
          record.expiresAt < new Date() ||
          record.failedAttempts >= OTP_MAX_FAILURES
        ) {
          record.isUsed = true;
          await repository.save(record);
          return false;
        }

        const matches = await this.matchesOtp(otp, record.otp);
        record.lastAttemptAt = new Date();
        if (!matches) {
          record.failedAttempts += 1;
          if (record.failedAttempts >= OTP_MAX_FAILURES) record.isUsed = true;
          await repository.save(record);
          return false;
        }
        record.isUsed = true;
        await repository.save(record);
        return true;
      },
    );
    if (!isValid) return { isValid: false };
    if (!issueContinuation) return { isValid: true };
    return {
      isValid: true,
      token: await this.createResetToken(normalizedEmail, type),
    };
  }

  async verifyResetToken(
    token: string,
    type: AuthTokenType,
  ): Promise<{ isValid: boolean; email?: string }> {
    const digest = this.hashToken(token);
    const record =
      (await this.authTokenRepository.findOne({
        where: { token: digest, type, isUsed: false },
      })) ??
      // Compatibilité de reprise pour les jetons historiques en clair.
      (await this.authTokenRepository.findOne({
        where: { token, type, isUsed: false },
      }));
    if (!record) return { isValid: false };
    if (record.expiresAt < new Date()) {
      record.isUsed = true;
      await this.authTokenRepository.save(record);
      return { isValid: false };
    }
    return { isValid: true, email: record.email };
  }

  async markTokenAsUsed(token: string): Promise<void> {
    const digest = this.hashToken(token);
    const record =
      (await this.authTokenRepository.findOne({ where: { token: digest } })) ??
      (await this.authTokenRepository.findOne({ where: { token } }));
    if (!record) return;
    record.isUsed = true;
    await this.authTokenRepository.save(record);
  }

  async cleanupExpiredTokens(): Promise<void> {
    await this.authTokenRepository.delete({
      expiresAt: LessThan(new Date()),
    });
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async matchesOtp(candidate: string, stored: string): Promise<boolean> {
    if (stored.startsWith('$2')) return bcrypt.compare(candidate, stored);
    const candidateBuffer = Buffer.from(candidate);
    const storedBuffer = Buffer.from(stored);
    return (
      candidateBuffer.length === storedBuffer.length &&
      timingSafeEqual(candidateBuffer, storedBuffer)
    );
  }
}
