import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { ExpressAdapter } from '@bull-board/express';
import { ClassSerializerInterceptor } from '@nestjs/common';

import { NestFactory, Reflector } from '@nestjs/core';

import { Transport } from '@nestjs/microservices';
import { SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { PermissionSeeder } from './core/auth/seeders/permission.seeder';
import { RoleSeeder } from './core/auth/seeders/role.seeder';
import { swaggerConfig } from './core/config/swagger.config';
import { seedDatabase } from './main.seeder';



dotenv.config();

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // ── SSE / streaming : désactiver Nagle sur chaque nouvelle connexion TCP ──
  // setNoDelay doit être activé DÈS la création du socket, avant tout traitement
  // HTTP. Le faire dans le handler de requête (res.socket.setNoDelay) est trop
  // tard — le kernel peut déjà avoir bufferisé le paquet SYN-ACK initial.
  (app.getHttpServer() as import('http').Server).on('connection', (socket) => {
    socket.setNoDelay(true);
    socket.uncork();
  });

  // Microservice TCP attaché à la MÊME instance NestJS (pas de second graph DI)
  app.connectMicroservice({
    transport: Transport.TCP,
    options: {
      host: process.env.MICROSERVICE_HOST || '0.0.0.0',
      port: parseInt(process.env.MICROSERVICE_PORT || '2999', 10),
    },
  });

  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
  );

  // Seeders : uniquement si demandé explicitement (évite re-exécution à chaque boot PM2)
  if (process.env.RUN_SEEDERS === 'true') {
    await app.get(PermissionSeeder).seed();
    await app.get(RoleSeeder).seed();
    await seedDatabase(app.get(DataSource));
  }

  // Swagger : dev uniquement
  if (process.env.NODE_ENV !== 'production') {
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api-docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true, 
        defaultModelsExpandDepth: -1,
      },
    });
  }

  // CORS : liste explicite (origin '*' + credentials est rejeté par le navigateur)
  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim())
    : true; // reflète l'origine de la requête en l'absence de config
  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');
  app.use('/admin/queues', serverAdapter.getRouter());

  const port = parseInt(process.env.PORT || '3004', 10);
  await app.startAllMicroservices();
  await app.listen(port);
  console.log(`✅ HTTP en écoute sur ${port}, microservice TCP sur ${process.env.MICROSERVICE_PORT || '2999'}`);
}
bootstrap();
