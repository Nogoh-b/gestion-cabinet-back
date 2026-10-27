import {
  applyDecorators,
  SetMetadata,
  UseGuards,
  UseInterceptors,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { ApiBearerAuth } from '@nestjs/swagger';
import { MarkPlatformRoute } from 'src/core/decorators/platform.decorator';
import type { PlatformRole } from '../entities/platform-admin.entity';
import {
  PLATFORM_ROLES_KEY,
  PlatformAuthGuard,
  PlatformRolesGuard,
} from './platform-auth.guard';
import { PlatformAuditInterceptor } from '../audit/platform-audit.interceptor';

/**
 * Route (ou contrôleur) de l'espace plateforme.
 *
 * - ignore le jeton cabinet (PublicGuard / SuspendedCabinetGuard) ;
 * - exige un jeton plateforme valide ;
 * - restreint aux rôles listés (owner a toujours accès ; aucun rôle = tous) ;
 * - journalise les mutations dans `platform_audit_logs`.
 *
 * Posé sur le contrôleur, `@PlatformRoles(...)` sur une méthode affine les rôles.
 */
export function PlatformRoute(...roles: PlatformRole[]) {
  return applyDecorators(
    MarkPlatformRoute(),
    SetMetadata(PLATFORM_ROLES_KEY, roles),
    UseGuards(PlatformAuthGuard, PlatformRolesGuard),
    UseInterceptors(PlatformAuditInterceptor),
    UsePipes(platformValidationPipe()),
    ApiBearerAuth(),
  );
}

/** Validation stricte des DTO plateforme (pas de pipe global dans l'app). */
export function platformValidationPipe() {
  return new ValidationPipe({
    whitelist: true,
    transform: true,
    transformOptions: { enableImplicitConversion: true },
  });
}

/** Restreint une méthode à certains rôles plateforme (owner toujours inclus). */
export const PlatformRoles = (...roles: PlatformRole[]) =>
  SetMetadata(PLATFORM_ROLES_KEY, roles);
