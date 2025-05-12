import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule } from '@nestjs/swagger';
import { swaggerConfig } from './core/config/swagger.config';
import { Transport } from '@nestjs/microservices';
import * as dotenv from 'dotenv';
import * as tls from 'tls';
import { PermissionSeeder } from './core/auth/seeders/permission.seeder';
import { SuperAdminSeeder } from './core/database/seeders/super-admin.seeder';
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
      port: 3002,
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
    await seeder.seed();
    await seederAdmin.seed();
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

  await Promise.all([app.listen(process.env.PORT ?? 3004), core.listen()])
    .then(() => {
      console.log('Microservices are listening (http) 3004 => (TPC) 3002');
    });
}
bootstrap();
