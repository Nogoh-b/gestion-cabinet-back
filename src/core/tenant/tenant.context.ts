import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

interface TenantStore {
  tenantId: number;
  // true si le tenant a été EXPLICITEMENT résolu (JWT, header, sous-domaine,
  // path). false (ou absent) si valeur de repli par défaut. Permet aux
  // consommateurs (patch Repository, stratégies) de distinguer un vrai tenant
  // d'un fallback de sécurité afin d'appliquer un comportement fail-closed.
  explicit?: boolean;
}

/**
 * Storage module-level unique — partagé entre TenantContext (DI) et
 * getCurrentTenantId() (fonction libre, utilisable sans DI dans le patch Repository).
 */
const _storage = new AsyncLocalStorage<TenantStore>();

/**
 * Fonction module-level : retourne le tenantId courant sans injection NestJS.
 * Utilisée par TenantRepositoryPatch pour filtrer les requêtes TypeORM.
 *
 * ATTENTION : retourne 1 par défaut (tenant système) si aucun contexte actif.
 * Pour distinguer un tenant réellement résolu d'un fallback, utiliser
 * getExplicitTenantId() qui retourne undefined quand aucune résolution
 * explicite n'a eu lieu.
 */
export function getCurrentTenantId(): number {
  return _storage.getStore()?.tenantId ?? 1;
}

/**
 * Retourne le tenantId UNIQUEMENT s'il a été explicitement résolu (JWT,
 * header, sous-domaine, path). Renvoie undefined sinon — utile pour appliquer
 * un comportement fail-closed plutôt que de retomber silencieusement sur le
 * tenant système (1).
 */
export function getExplicitTenantId(): number | undefined {
  const store = _storage.getStore();
  if (!store?.explicit) return undefined;
  return store.tenantId;
}

/**
 * Retourne true si un contexte tenant est actif dans l'AsyncLocalStorage courant.
 * false = exécution hors requête HTTP (script, cron, migration...).
 */
export function hasActiveTenant(): boolean {
  return _storage.getStore() !== undefined;
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

  /**
   * Exécute fn() dans un contexte lié au tenantId donné.
   * @param tenantId  Identifiant du cabinet.
   * @param fn        Fonction à exécuter dans le contexte.
   * @param explicit  true (défaut) si le tenant a été résolu explicitement
   *                  (JWT, header...). Passer false pour un fallback par défaut.
   */
  run<T>(tenantId: number, fn: () => T, explicit = true): T {
    return this.storage.run({ tenantId, explicit }, fn);
  }

  /** Exécute fn() SANS contexte tenant (accès global hors requête HTTP). */
  runWithoutTenant<T>(fn: () => T): T {
    return this.storage.run(undefined as any, fn);
  }

  /** Retourne le tenantId du contexte courant (ou 1 par défaut) */
  getTenantId(): number {
    return this.storage.getStore()?.tenantId ?? 1;
  }

  /** Retourne le tenantId seulement s'il est explicitement résolu. */
  getExplicitTenantId(): number | undefined {
    return getExplicitTenantId();
  }

  /** Retourne true si un contexte tenant est actif */
  hasTenant(): boolean {
    return this.storage.getStore() !== undefined;
  }
}
