import { Queue } from 'bull';
import * as dotenv from 'dotenv';
import * as tls from 'tls';
import { createBullBoard } from '@bull-board/api';
import { BullAdapter } from '@bull-board/api/bullAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { getQueueToken } from '@nestjs/bull';
import { NestFactory } from '@nestjs/core';
import { Transport } from '@nestjs/microservices';
import { SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { PermissionSeeder } from './core/auth/seeders/permission.seeder';
import { swaggerConfig } from './core/config/swagger.config';
import { SuperAdminSeeder } from './core/database/seeders/super-admin.seeder';
import { TypePersonnelSeeder } from './modules/personnel/type_personnel/seed-type-personnel';
import { ProviderSeeder } from './modules/provider/provider/provider.seeder';
import { TransactionTypeSeeder } from './modules/transaction/transaction_type/transaction-type.seeder';



dotenv.config();

async function bootstrap() {
  const root_dir = process.cwd();
  const SSL_KEY_PATH = ''/*fs.readFileSync(
    `${root_dir}/${process.env.SSL_KEY_PATH}`,
    'utf8',
  );*/
  const SSL_CERTIFICATE_PATH ='' /*fs.readFileSync(
    `${root_dir}/${process.env.SSL_CERTIFICATE_PATH}`,
    'utf8',
  );*/

  const SSL_CA_PATH ='' /*fs.readFileSync(
    `${process.env.HOME}/${process.env.SSL_CA_PATH}`,
    'utf8',
  );*/

  const app = await NestFactory.create(AppModule);
  const core = await NestFactory.createMicroservice(AppModule, {
    transport: Transport.TCP,
    options: {
      port: 3003,
      tlsOptions: {
        key: SSL_KEY_PATH,
        cert: SSL_CERTIFICATE_PATH,
        ca: SSL_CA_PATH,
        requestCert: true,
        rejectUnauthorized: true,
      } as tls.TlsOptions,
    },
  });
    const seeder = app.get(PermissionSeeder);
    const seederAdmin = app.get(SuperAdminSeeder);
    const txType = app.get(TransactionTypeSeeder);
    const providerSeeder = app.get(ProviderSeeder);
    const typePersonnelSeeder = app.get(TypePersonnelSeeder);
    await seeder.seed();
    await seederAdmin.seed();
    await txType.seed();
    await providerSeeder.seed();
    // await typePersonnelSeeder.seed();
    // Configuration Swagger
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, document, {
  swaggerOptions: {
    persistAuthorization: true,
    defaultModelsExpandDepth: -1

  },
});

  app.enableCors({
    origin: '*',
    credentials: true, // important si tu envoies Authorization header ou cookies
  });
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');
  const taskQueue = app.get<Queue>(getQueueToken('task-queue'));
  createBullBoard({
    queues: [new BullAdapter(taskQueue)],
    serverAdapter,
  });
  app.use('/admin/queues', serverAdapter.getRouter());
  await Promise.all([app.listen(process.env.PORT ?? 3004), core.listen()])
    .then(() => {
      console.log('Microservices are listening (http) 3004 => (TPC) 3002');
    });
}
bootstrap();
