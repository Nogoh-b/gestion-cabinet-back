import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { CoreModule } from './core/core.module';
import { IamModule } from './modules/iam/iam.module';
import { CustomerModule } from './modules/customer/customer.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { ConfigModule } from '@nestjs/config';
import { UPLOAD_FOLDER_NAME, UPLOAD_PATH } from './core/common/constants/constants';
import { ServeStaticModule } from '@nestjs/serve-static';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { AgenciesModule } from './modules/agencies/agencies.module';
import * as dotenv from 'dotenv';
import { MailerModule } from '@nestjs-modules/mailer';
import { SavingsAccountModule } from './modules/savings-account/savings-account.module';
dotenv.config();

@Module({
  imports: [
    CoreModule,
    IamModule,
    AgenciesModule,
    DocumentsModule,
    CustomerModule,
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
        host: 'vshp3.clo.xelgrp.com',
        port: 587,
        secure: false, // true pour le port 465
        auth: {
          user: 'no-reply-cotimendo.cm',
          pass: 'Iz03ik33?',
        },
      },
      defaults: {
        from: '"No Reply" <noreply@mendo-finance.com>',
      },
    }),
    ClientsModule.register([
      {
        name: 'USER_SERVICE',
        transport: Transport.TCP,
        options: {
          host: 'localhost',
          port: 3002, // port du microservice cible
        },
      },
    ]),
    SavingsAccountModule,
  ],
  controllers: [AppController],
  providers: [AppService],
  exports:[MailerModule]
})
export class AppModule {
  /*configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(AuthMiddleware)
      .forRoutes('*'); // ou seulement les routes protégées
  }*/
}
