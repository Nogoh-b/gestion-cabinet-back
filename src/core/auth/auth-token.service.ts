// src/modules/auth/auth-token.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { AuthToken } from './entities/auth-token.entity';
import * as crypto from 'crypto';

@Injectable()
export class AuthTokenService {
  constructor(
    @InjectRepository(AuthToken)
    private authTokenRepository: Repository<AuthToken>,
  ) {}

  /**
   * Générer un OTP à 6 chiffres
   */
  generateOTP(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Générer un token sécurisé
   */
  generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Créer un OTP pour réinitialisation
   */
  async createOTP(email: string, type: 'reset_password' | 'set_password'): Promise<{ otp: string; expiresAt: Date }> {
    // Supprimer les anciens tokens non utilisés
    await this.authTokenRepository.delete({
      email,
      type,
      isUsed: false,
    });

    const otp = this.generateOTP();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 10); // Expire dans 10 minutes

    const authToken = this.authTokenRepository.create({
      email,
      otp,
      type,
      expiresAt,
      isUsed: false,
    });

    await this.authTokenRepository.save(authToken);

    return { otp, expiresAt };
  }

  /**
   * Créer un token pour réinitialisation (après vérification OTP)
   */
  async createResetToken(email: string, type: 'reset_password' | 'set_password'): Promise<string> {
    const token = this.generateToken();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15); // Token expire dans 15 minutes

    const authToken = this.authTokenRepository.create({
      email,
      token,
      type,
      expiresAt,
      isUsed: false,
    });

    await this.authTokenRepository.save(authToken);

    return token;
  }

  /**
   * Vérifier l'OTP
   */
  async verifyOTP(email: string, otp: string, type: 'reset_password' | 'set_password'): Promise<{ isValid: boolean; token?: string }> {
    const authToken = await this.authTokenRepository.findOne({
      where: {
        email,
        otp,
        type,
        isUsed: false,
      },
    });

    if (!authToken) {
      return { isValid: false };
    }

    // Vérifier l'expiration
    if (new Date() > authToken.expiresAt) {
      await this.authTokenRepository.delete(authToken.id);
      return { isValid: false };
    }

    // Marquer l'OTP comme utilisé
    authToken.isUsed = true;
    await this.authTokenRepository.save(authToken);

    // Créer un token pour la prochaine étape
    const token = await this.createResetToken(email, type);

    return { isValid: true, token };
  }

  /**
   * Vérifier le token de réinitialisation
   */
  async verifyResetToken(token: string, type: 'reset_password' | 'set_password'): Promise<{ isValid: boolean; email?: string }> {
    const authToken = await this.authTokenRepository.findOne({
      where: {
        token,
        type,
        isUsed: false,
      },
    });

    if (!authToken) {
      return { isValid: false };
    }

    // Vérifier l'expiration
    if (new Date() > authToken.expiresAt) {
      await this.authTokenRepository.delete(authToken.id);
      return { isValid: false };
    }

    return { isValid: true, email: authToken.email };
  }

  /**
   * Marquer un token comme utilisé
   */
  async markTokenAsUsed(token: string): Promise<void> {
    const authToken = await this.authTokenRepository.findOne({ where: { token } });
    if (authToken) {
      authToken.isUsed = true;
      await this.authTokenRepository.save(authToken);
    }
  }

  /**
   * Nettoyer les tokens expirés (Cron job)
   */
  async cleanupExpiredTokens(): Promise<void> {
    await this.authTokenRepository.delete({
      expiresAt: LessThan(new Date()),
    });
  }
}