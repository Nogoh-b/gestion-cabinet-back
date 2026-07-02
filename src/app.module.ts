import * as dotenv from 'dotenv';
import { ExpressAdapter } from '@bull-board/express';
import { BullBoardModule } from '@bull-board/nestjs';
import { MailerModule } from '@nestjs-modules/mailer';
import { BullModule } from '@nestjs/bull';
import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { MulterModule } from '@nestjs/platform-express';








import { ServeStaticModule } from '@nestjs/serve-static';



import { AppController } from './app.controller';
import { AppService } from './app.service';
import { TenantResolverMiddleware } from './core/tenant/tenant-resolver.middleware';
import { CoreModule } from './core/core.module';
import { CabinetModule } from './modules/cabinet/cabinet.module';
import { OnboardingModule } from './modules/onboarding/onboarding.module';
import { ActivitiesModule } from './modules/activities/activities.module';
import { AgenciesModule } from './modules/agencies/agencies.module';
import { AudiencesModule } from './modules/audiences/audiences.module';
import { ChatModule } from './modules/chat/chat.module';
import { CustomerModule } from './modules/customer/customer.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { DossiersModule } from './modules/dossiers/dossiers.module';
import { FactureModule } from './modules/facture/facture.module';
import { FinancesModule } from './modules/finances/finances.module';
import { GeographyModule } from './modules/geography/geography.module';
import { IamModule } from './modules/iam/iam.module';
import { NotificationModule } from './modules/notification/notification.module';
import { PaiementModule } from './modules/paiement/paiement.module';
import { ProceduresModule } from './modules/procedures/procedures.module';
import { JurisdictionModule } from './modules/jurisdiction/jurisdiction.module';
import { DocumentCategoryModule } from './modules/document-category/document-category.module';
import { AudienceTypeModule } from './modules/audience-type/audience-type.module';
import { InvoiceTypeModule } from './modules/invoice-type/invoice-type.module';
import { DiligenceModule } from './modules/diligence/diligence.module';
import { FindingModule } from './modules/finding/finding.module';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/adapters/handlebars.adapter';
import { join } from 'path';
import { StatsModule } from './modules/stats/stats.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { helpers } from './utils/helper-template-maill';
import { ProcedureModule } from './modules/procedure/procedure.module';
import { AiDatabaseModule } from './core/ai-database/ai-database.module';
import { AiDatabaseProjectModule } from './config/ai-database/ai-database-project.module';
import { ReferralModule } from './modules/referral/referral.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { SupplierModule } from './modules/supplier/supplier.module';
import { SettingsModule } from './modules/settings/settings.module';
import { PlansModule } from './modules/plans/plans.module';
import { PdfTemplatesModule } from './modules/pdf-templates/pdf-templates.module';
import { MailTemplateModule } from './modules/mail-template/mail-template.module';
import { TemplateBlocksModule } from './modules/template-blocks/template-blocks.module';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ScheduleModule } from '@nestjs/schedule';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { ComptabiliteModule } from './modules/comptabilite/comptabilite.module';
import { SubscriptionsModule } from './modules/subscriptions/subscriptions.module';
import { SuspendedCabinetGuard } from './core/common/guards/suspended-cabinet.guard';
import { ReminderSchedulerModule } from './core/scheduler/reminder.scheduler.module';
import { BackupModule } from './modules/backup/backup.module';
import { ReportsModule } from './modules/reports/reports.module';
import { ExportModule } from './modules/export/export.module';









dotenv.config();

@Module({
  imports: [
    MulterModule.register({
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB
      },
    }),
     CoreModule,
    CabinetModule,
    OnboardingModule,

    EventEmitterModule.forRoot(),
    ScheduleModule.forRoot(),
    // Rate limiting global : protège contre le brute-force (login, OTP...) et
    // les abus d'API. Limites configurables via RATE_LIMIT_TTL / RATE_LIMIT_MAX.
    // Des @Throttle spécifiques resserrent les routes d'authentification.
    ThrottlerModule.forRoot([
      {
        ttl: parseInt(process.env.RATE_LIMIT_TTL || '60', 10) * 1000,
        limit: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
      },
    ]),
    ComptabiliteModule,

    // 2. Modules indépendants
    IamModule,
    GeographyModule,
    
    // 3. Modules avec dépendances simples
    AgenciesModule, 
    DocumentsModule,
    DossiersModule,
    // 4. Modules avec dépendances complexes (utilisent forwardRef)
    CustomerModule,
    
    // 5. Autres modules
    ActivitiesModule,
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env'],
    }),
    // NB: le service statique des uploads est désormais géré par un middleware
    // Express sécurisé dans main.ts (Content-Disposition: attachment +
    // X-Content-Type-Options: nosniff), au lieu du ServeStaticModule qui
    // n'ajoutait aucun en-tête de sécurité (risque XSS/sniffing sur les
    // pièces de dossiers juridiques).
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        transport: {
          host: config.get<string>('SMTP_HOST'),
          port: config.get<number>('SMTP_PORT', 465),
          secure: config.get<string>('SMTP_SECURE', 'true') === 'true',
          auth: {
            user: config.get<string>('SMTP_USER'),
            pass: config.get<string>('SMTP_PASSWORD'),
          },
        },
        defaults: {
          from: config.get<string>(
            'MAIL_FROM',
            '"No Reply" <no-reply@example.com>',
          ),
        },
        template: {
          dir: join(process.cwd(), 'src', 'core', 'shared', 'emails', 'templates'),
          adapter: new HandlebarsAdapter(helpers),
          options: {
            strict: true,
            defaultLayout: 'layout',
          },
        },
        options: {
          partials: {
            dir: join(process.cwd(), 'src', 'core', 'shared', 'emails', 'templates'),
            options: {
              strict: true,
            },
          },
        },
      }),
    }),
    ClientsModule.register([
      {
        name: 'USER_SERVICE',
        transport: Transport.TCP,
        options: {
          host: 'localhost',
          port: 3003, // port du microservice cible
        },
      },
    ]),

    BullModule.forRoot({
      redis: {
        host: process.env.BULL_REDIS_HOST,
        port: parseInt(process.env.BULL_REDIS_PORT || '6379', 10),
        db: parseInt(process.env.BULL_REDIS_DB || '0', 10),
      },
      prefix: process.env.BULL_QUEUE_PREFIX || 'core-server-dev',
    }),
    BullModule.registerQueue({
      name: 'maintenance',
    }),
    BullBoardModule.forRoot({
      route: '/admin/queues',
      adapter: ExpressAdapter,
    }),
    ActivitiesModule,
    AudiencesModule,
    FinancesModule,
    ProceduresModule,
    FactureModule,
    PaiementModule,
    ChatModule,
    NotificationModule,
    JurisdictionModule,
    DocumentCategoryModule,
    AudienceTypeModule,
    InvoiceTypeModule,
    DiligenceModule,
    FindingModule,
    StatsModule,
    DashboardModule,
    ProcedureModule,
    AiDatabaseProjectModule,
    AiDatabaseModule,
    ReferralModule,
    PayrollModule,
    SupplierModule,
    SettingsModule,
    PlansModule,
    SubscriptionsModule,
    PdfTemplatesModule,
    MailTemplateModule,
    TemplateBlocksModule,
    ReminderSchedulerModule,
    BackupModule,
    ReportsModule,
    ExportModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    // ThrottlerGuard AVANT SuspendedCabinetGuard : le rate limiting s'applique
    // en premier à toutes les routes (anti brute-force).
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_GUARD,
      useClass: SuspendedCabinetGuard,
    },
  ],
  exports: [MailerModule],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(TenantResolverMiddleware)
      .forRoutes('*'); // Résolution tenant sur toutes les routes
  }
}
