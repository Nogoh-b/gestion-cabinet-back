import * as dotenv from 'dotenv';
import { MailerModule } from '@nestjs-modules/mailer';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';



import { ClientsModule, Transport } from '@nestjs/microservices';
import { ServeStaticModule } from '@nestjs/serve-static';










import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UPLOAD_FOLDER_NAME, UPLOAD_PATH } from './core/common/constants/constants';
import { CoreModule } from './core/core.module';
import { ActivitiesModule } from './modules/activities/activities.module';
import { AgenciesModule } from './modules/agencies/agencies.module';
import { CustomerModule } from './modules/customer/customer.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { IamModule } from './modules/iam/iam.module';
import { ProviderModule } from './modules/provider/provider.module';
import { QueueModule } from './modules/queue/queue.module';
import { SavingsAccountModule } from './modules/savings-account/savings-account.module';
import { TransactionModule } from './modules/transaction/transaction.module';













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
        host: 'smtp.gmail.com',
        port: 465 ,
        secure: true, // true pour le port 465
        auth: {
          user: 'somkwebrice@gmail.com',
          pass: 'odmj vidj teir ahds',
        },
      },
      defaults: {
        from: '"No Reply" <somkwebrice@gmail.com>',
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

    /*BullModule.forRoot({
          redis: {
            host: 'localhost',
            port: 6379,
          },
    }),
    BullModule.registerQueue({
        name: 'maintenance',
    }),
    BullBoardModule.forRoot({
      route: '/admin/queues',
      adapter: ExpressAdapter,
    }),*/
    SavingsAccountModule,
    ProviderModule,
    TransactionModule,
    ActivitiesModule,
    QueueModule
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
