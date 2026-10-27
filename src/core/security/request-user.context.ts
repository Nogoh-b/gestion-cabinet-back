import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

/**
 * Identité de l'appelant pour la requête HTTP courante.
 *
 * Volontairement minimal : seulement ce dont les filtres de visibilité ont
 * besoin. Le reste du payload JWT reste accessible via `@CurrentUser()`.
 */
export interface RequestUserStore {
  userId: number;
  role?: string;
  permissions: string[];
  /**
   * Dossiers confidentiels explicitement ouverts à l'appelant, résolus une
   * seule fois par requête (cache rempli à la première lecture filtrée).
   */
  grantedDossierIds?: number[];
}

/**
 * Storage module-level unique — partagé entre RequestUserContext (DI) et les
 * fonctions libres ci-dessous, utilisables sans DI (patch Repository, helpers
 * de QueryBuilder), exactement comme TenantContext.
 */
const _storage = new AsyncLocalStorage<RequestUserStore>();

/**
 * Utilisateur de la requête courante, ou `undefined` hors contexte HTTP
 * (script, cron, migration, seeder).
 */
export function getCurrentRequestUser(): RequestUserStore | undefined {
  return _storage.getStore();
}

/** true si une requête HTTP authentifiée est en cours. */
export function hasActiveRequestUser(): boolean {
  return _storage.getStore() !== undefined;
}

/**
 * RequestUserContext — stocke l'appelant courant par requête HTTP.
 *
 * Même mécanique que TenantContext : un AsyncLocalStorage isolé par requête,
 * sans service request-scoped.
 */
@Injectable()
export class RequestUserContext {
  private readonly storage = _storage;

  /** Exécute fn() dans le contexte de l'utilisateur donné. */
  run<T>(user: RequestUserStore, fn: () => T): T {
    return this.storage.run(user, fn);
  }

  getUser(): RequestUserStore | undefined {
    return getCurrentRequestUser();
  }
}

/**
 * Exécute `fn` SANS contexte utilisateur : les filtres de visibilité
 * s'effacent et la requête voit toutes les données du cabinet.
 *
 * Réservé aux traitements internes qui doivent légitimement ignorer la
 * visibilité de l'appelant — par exemple relire un dossier que l'on vient
 * soi-même de créer, ou générer un numéro de dossier unique (qui doit tenir
 * compte des dossiers confidentiels sans les exposer).
 */
export function runWithoutRequestUser<T>(fn: () => T): T {
  return _storage.run(undefined as unknown as RequestUserStore, fn);
}
