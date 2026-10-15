import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EmailsModule } from 'src/core/shared/emails/emails.module';
import { AiDatabaseModule } from 'src/core/ai-database/ai-database.module';
import { BackupModule } from '../backup/backup.module';
import { PlansModule } from '../plans/plans.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { PlatformAdmin } from './entities/platform-admin.entity';
import { PlatformAdminToken } from './entities/platform-admin-token.entity';
import { PlatformAuditLog } from './entities/platform-audit-log.entity';
import { PlatformSetting } from './entities/platform-setting.entity';
import { PlatformJwtStrategy } from './auth/platform-jwt.strategy';
import { PlatformAuthGuard, PlatformRolesGuard } from './auth/platform-auth.guard';
import { PlatformAuthService } from './auth/platform-auth.service';
import { PlatformAuthController } from './auth/platform-auth.controller';
import { PlatformAuditService } from './audit/platform-audit.service';
import { PlatformAuditInterceptor } from './audit/platform-audit.interceptor';
import { PlatformAuditController } from './audit/platform-audit.controller';
import { PlatformMailerService } from './common/platform-mailer.service';
import { PlatformAdminsService } from './admins/platform-admins.service';
import { PlatformAdminsController } from './admins/platform-admins.controller';
import { PlatformSettingsService } from './settings/platform-settings.service';
import { PlatformSettingsController } from './settings/platform-settings.controller';
import { PlatformBackupsController } from './backups/platform-backups.controller';
import { PlatformCabinetsService } from './cabinets/platform-cabinets.service';
import { PlatformCabinetsController } from './cabinets/platform-cabinets.controller';
import { PlatformSubscriptionsController } from './cabinets/platform-subscriptions.controller';
import { PlatformPlansController } from './plans/platform-plans.controller';
import { PlatformPaymentsService } from './payments/platform-payments.service';
import { PlatformPaymentsController } from './payments/platform-payments.controller';
import { PlatformPaymentMethodsController } from './payments/platform-payment-methods.controller';
import { PlatformRevenueService } from './revenue/platform-revenue.service';
import { PlatformRevenueController } from './revenue/platform-revenue.controller';
import { PlatformCouponsController } from './coupons/platform-coupons.controller';
import { PlatformImpersonationService } from './impersonation/platform-impersonation.service';
import {
  PlatformImpersonationController,
  TenantImpersonationController,
} from './impersonation/platform-impersonation.controller';
import { PlatformAiService } from './ai/platform-ai.service';
import { PlatformAiController } from './ai/platform-ai.controller';

/**
 * Espace PLATEFORME (super admin) : comptes, rôles, audit, paramètres,
 * pilotage des cabinets / abonnements / paiements / revenus, moteurs IA.
 * Toutes les routes vivent sous `/platform/*` (aucun contexte cabinet).
 */
@Module({
  imports: [
    PassportModule,
    EmailsModule,
    AiDatabaseModule,
    BackupModule,
    PlansModule,
    SubscriptionsModule,
    TypeOrmModule.forFeature([
      PlatformAdmin,
      PlatformAdminToken,
      PlatformAuditLog,
      PlatformSetting,
    ]),
  ],
  controllers: [
    PlatformAuthController,
    PlatformAdminsController,
    PlatformAuditController,
    PlatformSettingsController,
    PlatformBackupsController,
    PlatformCabinetsController,
    PlatformSubscriptionsController,
    PlatformPlansController,
    PlatformPaymentsController,
    PlatformPaymentMethodsController,
    PlatformRevenueController,
    PlatformCouponsController,
    PlatformImpersonationController,
    TenantImpersonationController,
    PlatformAiController,
  ],
  providers: [
    PlatformJwtStrategy,
    PlatformAuthGuard,
    PlatformRolesGuard,
    PlatformAuthService,
    PlatformAuditService,
    PlatformAuditInterceptor,
    PlatformMailerService,
    PlatformAdminsService,
    PlatformSettingsService,
    PlatformCabinetsService,
    PlatformPaymentsService,
    PlatformRevenueService,
    PlatformImpersonationService,
    PlatformAiService,
  ],
  exports: [
    PlatformAuditService,
    PlatformMailerService,
    PlatformSettingsService,
    PlatformAuthGuard,
    PlatformRolesGuard,
    PlatformAuditInterceptor,
  ],
})
export class PlatformModule {}
