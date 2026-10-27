import { SetMetadata } from '@nestjs/common';

export const PLATFORM_AUDIT_KEY = 'platformAudit';

export interface PlatformAuditMeta {
  action: string;
  targetType?: string;
  /** Nom du paramètre de route portant l'id de la cible (défaut : `id`). */
  targetParam?: string;
  /** Paramètre de route portant l'id du cabinet concerné. */
  cabinetParam?: string;
}

/** Nomme l'action d'audit d'une route plateforme (ex. `cabinet.suspend`). */
export const PlatformAudit = (meta: PlatformAuditMeta) =>
  SetMetadata(PLATFORM_AUDIT_KEY, meta);
