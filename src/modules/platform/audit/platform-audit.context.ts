import { AsyncLocalStorage } from 'async_hooks';

/** Détails métier qu'un service ajoute à la ligne d'audit de la requête. */
export interface PlatformAuditDetails {
  action?: string;
  targetType?: string | null;
  targetId?: string | number | null;
  cabinetId?: number | null;
  summary?: string | null;
  before?: Record<string, any> | null;
  after?: Record<string, any> | null;
}

const storage = new AsyncLocalStorage<PlatformAuditDetails>();

/**
 * Contexte d'audit par requête plateforme (AsyncLocalStorage).
 *
 * Le PlatformAuditInterceptor ouvre le contexte ; les services y déposent
 * before/after/cabinet via `PlatformAuditContext.set(...)`. Une seule ligne
 * d'audit est écrite par requête mutante, même si le service n'appelle pas
 * `set` (action dérivée de la route).
 */
export const PlatformAuditContext = {
  run<T>(fn: () => T): T {
    return storage.run({}, fn);
  },
  set(details: PlatformAuditDetails): void {
    const store = storage.getStore();
    if (store) Object.assign(store, details);
  },
  get(): PlatformAuditDetails | undefined {
    return storage.getStore();
  },
};
