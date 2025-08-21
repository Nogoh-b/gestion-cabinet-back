// src/auth/key-generator.service.ts
import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';

@Injectable()
export class KeyGeneratorService {
  generatePublicKey(): string {
    return randomBytes(16).toString('hex');
  }

  generateSecretKey(): string {
    return randomBytes(32).toString('hex');
  }

  generateKeyPair(): { publicKey: string; secretKey: string } {
    return {
      publicKey: this.generatePublicKey(),
      secretKey: this.generateSecretKey(),
    };
  }
}