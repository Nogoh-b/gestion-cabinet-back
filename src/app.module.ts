import * as dotenv from 'dotenv';
import { ExpressAdapter } from '@bull-board/express';
import { BullBoardModule } from '@bull-board/nestjs';
import { MailerModule } from '@nestjs-modules/mailer';
import { BullModule } from '@nestjs/bull';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { MulterModule } from '@nestjs/platform-express';








import { ServeStaticModule } from '@nestjs/serve-static';



import { AppController } from './app.controller';
import { AppService } from './app.service';
import {
  UPLOAD_FOLDER_NAME,
  UPLOAD_PATH,
} from './core/common/constants/constants';
import { CoreModule } from './core/core.module';
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
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { join } from 'path';
import { StatsModule } from './modules/stats/stats.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { helpers } from './utils/helper-template-maill';
import { ProcedureModule } from './modules/procedure/procedure.module';









dotenv.config();

@Module({
  imports: [
    MulterModule.register({
      limits: {
        fileSize: 50 * 1024 * 1024, // 50MB
      },
    }),
     CoreModule,
    
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
    ServeStaticModule.forRoot({
      rootPath: UPLOAD_PATH,
      serveRoot: `/${UPLOAD_FOLDER_NAME}/`,
    }),
    MailerModule.forRoot({
      transport: {
        host: 'mail.nouyadjamassociates.com',
        port: 465,
        secure: true, // true pour le port 465
        auth: {
          user: 'emelineenanga@nouyadjamassociates.com',
          pass: 'Aq123456789!',
        },
      },
      defaults: {
        from: '"No Reply NOUYADJAM & ASSOCIATES" <emelineenanga@nouyadjamassociates.com>',
      }, 
      template: {
        dir: join(process.cwd(), 'src', 'core', 'shared', 'emails', 'templates'),
        // adapter: new HandlebarsAdapter(helpers), // Moteur de template
        adapter: new HandlebarsAdapter(helpers), // Moteur de template
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
    // SavingsAccountModule,
    // ProviderModule,
    // TransactionModule,
    ActivitiesModule,
    // PartnerModule,
    // CommercialModule,
    // RessourceModule,
    // PersonnelModule,
    // CreditModule,
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
    ProcedureModule
  ],
  controllers: [AppController],
  providers: [AppService],
  exports: [MailerModule],
})
export class AppModule {
  /*configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(AuthMiddleware)
      .forRoutes('*'); // ou seulement les routes protégées
  }*/
}
