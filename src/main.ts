import * as dotenv from 'dotenv';
import * as tls from 'tls';
import { ExpressAdapter } from '@bull-board/express';
import { NestFactory, Reflector } from '@nestjs/core';
import { Transport } from '@nestjs/microservices';


import { SwaggerModule } from '@nestjs/swagger';



import { AppModule } from './app.module';
import { PermissionSeeder } from './core/auth/seeders/permission.seeder';
import { RoleSeeder } from './core/auth/seeders/role.seeder';
import { swaggerConfig } from './core/config/swagger.config';
import { seedDatabase } from './main.seeder';
import { DataSource } from 'typeorm';
import { ClassSerializerInterceptor } from '@nestjs/common';





dotenv.config();

async function bootstrap() {
  const root_dir = process.cwd();
  const SSL_KEY_PATH = ''; /*fs.readFileSync(
    `${root_dir}/${process.env.SSL_KEY_PATH}`,
    'utf8',
  );*/
  const SSL_CERTIFICATE_PATH = ''; /*fs.readFileSync(
    `${root_dir}/${process.env.SSL_CERTIFICATE_PATH}`,
    'utf8',
  );*/

  const SSL_CA_PATH = ''; /*fs.readFileSync(
    `${process.env.HOME}/${process.env.SSL_CA_PATH}`,
    'utf8',
  );*/


  const app = await NestFactory.create(AppModule);

  // ── SSE / streaming : désactiver Nagle sur chaque nouvelle connexion TCP ──
  // setNoDelay doit être activé DÈS la création du socket, avant tout traitement
  // HTTP. Le faire dans le handler de requête (res.socket.setNoDelay) est trop
  // tard — le kernel peut déjà avoir bufferisé le paquet SYN-ACK initial.
  (app.getHttpServer() as import('http').Server).on('connection', (socket) => {
    socket.setNoDelay(true);   // désactive Nagle → chaque write() = 1 paquet TCP
    socket.uncork();           // vide tout buffer de stream interne
  });
  const core = await NestFactory.createMicroservice(AppModule, {
    transport: Transport.TCP,
    options: {
      port: 2999,
      tlsOptions: {
        key: SSL_KEY_PATH,
        cert: SSL_CERTIFICATE_PATH,
        ca: SSL_CA_PATH,
        requestCert: true,
        rejectUnauthorized: true,
      } as tls.TlsOptions,
    },
  });
  // ── Seeders : permissions puis rôles (ordre important) ──────────────────
  await app.get(PermissionSeeder).seed();
  await app.get(RoleSeeder).seed();

  app.useGlobalInterceptors(
    new ClassSerializerInterceptor(app.get(Reflector)),
  );

  // Configuration Swagger
  if (process.env.NODE_ENV === 'development') {
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('api-docs', app, document, {
      swaggerOptions: {
        persistAuthorization: true,
        defaultModelsExpandDepth: -1,
      },
    });
  }

  app.enableCors({
    origin: '*',
    credentials: true, // important si tu envoies Authorization header ou cookies
  });
  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath('/admin/queues');

  app.use('/admin/queues', serverAdapter.getRouter());
  // app.use(json({limit : '10mb'}))
  // app.use(urlencoded({extended : true , limit : '10mb'}))
  await seedDatabase(app.get(DataSource));

  await Promise.all([app.listen(process.env.PORT ?? 3004), core.listen()]).then(
    () => {
      console.log(
        'Microservices are listening (http) =>',
        process.env.PORT ?? 3004,
      );
    },
  );
}
bootstrap();
