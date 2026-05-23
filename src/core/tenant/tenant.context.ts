import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

interface TenantStore {
  tenantId: number;
}

/**
 * Storage module-level unique — partagé entre TenantContext (DI) et
 * getCurrentTenantId() (fonction libre, utilisable sans DI dans le patch Repository).
 */
const _storage = new AsyncLocalStorage<TenantStore>();

/**
 * Fonction module-level : retourne le tenantId courant sans injection NestJS.
 * Utilisée par TenantRepositoryPatch pour filtrer les requêtes TypeORM.
 */
export function getCurrentTenantId(): number {
  return _storage.getStore()?.tenantId ?? 1;
}

/**
 * TenantContext — stocke le tenantId courant par requête HTTP.
 *
 * Utilise AsyncLocalStorage (Node.js built-in) : chaque requête async
 * a son propre contexte isolé, sans risque de collision entre requêtes
 * concurrentes. Pas besoin de services request-scoped.
 *
 * Usage :
 *   // Dans un service ou repository :
 *   const tenantId = this.tenantContext.getTenantId(); // → 1, 2, 3...
 *   // OU sans DI (dans Repository patch) :
 *   const tenantId = getCurrentTenantId();
 */
@Injectable()
export class TenantContext {
  private readonly storage = _storage;

  /** Exécute fn() dans un contexte lié au tenantId donné */
  run<T>(tenantId: number, fn: () => T): T {
    return this.storage.run({ tenantId }, fn);
  }

  /** Retourne le tenantId du contexte courant (ou 1 par défaut) */
  getTenantId(): number {
    return this.storage.getStore()?.tenantId ?? 1;
  }

  /** Retourne true si un contexte tenant est actif */
  hasTenant(): boolean {
    return this.storage.getStore() !== undefined;
  }
}
