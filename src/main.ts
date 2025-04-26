import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Transport } from '@nestjs/microservices';
import { ValidationPipe } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

async function bootstrap() {
  const SSL_KEY_PATH = fs.readFileSync(`${process.cwd()}/ssl/key.pem`, 'utf8');
  const SSL_CERTIFICATE_PATH = fs.readFileSync(
    `${process.cwd()}/ssl/cert.pem`,
    'utf8',
  );
  const app = await NestFactory.createMicroservice(AppModule, {
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0',
      port: 3002,
      tlsOptions: {
        key: SSL_KEY_PATH,
        cert: SSL_CERTIFICATE_PATH,
      },
    },
  });
  app.useGlobalPipes(new ValidationPipe());
  await app.listen();
}
bootstrap();
