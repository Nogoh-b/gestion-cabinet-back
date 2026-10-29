import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Redis } from 'ioredis';

/**
 * Cache Redis court des compteurs de la sidebar. Il ne doit jamais bloquer
 * ni casser la requête : sans Redis (indisponible, non configuré), on lit et
 * on écrit « dans le vide » et les compteurs sont simplement recalculés.
 */
@Injectable()
export class SidebarCountsCache implements OnModuleDestroy {
  private readonly logger = new Logger(SidebarCountsCache.name);
  private client: Redis | null = null;
  private failureLogged = false;

  private redis(): Redis | null {
    if (this.client) return this.client;
    const host = process.env.BULL_REDIS_HOST;
    if (!host) return null;
    this.client = new Redis({
      host,
      port: parseInt(process.env.BULL_REDIS_PORT || '6379', 10),
      db: parseInt(process.env.BULL_REDIS_DB || '0', 10),
      password: process.env.BULL_REDIS_PASSWORD || undefined,
      connectTimeout: 1_000,
      commandTimeout: 500,
      maxRetriesPerRequest: 1,
      // Hors ligne : échec immédiat plutôt qu'une file d'attente qui gonfle.
      enableOfflineQueue: false,
      // Pas de boucle de reconnexion bruyante : on retente par intervalles.
      retryStrategy: (attempt) => Math.min(attempt * 1_000, 30_000),
    });
    this.client.on('error', (error) => this.logFailure(error));
    return this.client;
  }

  private logFailure(error: unknown) {
    if (this.failureLogged) return;
    this.failureLogged = true;
    this.logger.warn(
      `Cache Redis des compteurs indisponible, calcul sans cache: ${
        (error as Error)?.message ?? error
      }`,
    );
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const raw = await this.redis()?.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch (error) {
      this.logFailure(error);
      return null;
    }
  }

  async set(key: string, value: unknown, ttlSeconds: number): Promise<void> {
    try {
      await this.redis()?.set(key, JSON.stringify(value), 'EX', ttlSeconds);
    } catch (error) {
      this.logFailure(error);
    }
  }

  onModuleDestroy() {
    this.client?.disconnect();
    this.client = null;
  }
}
