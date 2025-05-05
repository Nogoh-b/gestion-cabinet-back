import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule } from '@nestjs/swagger';
import { swaggerConfig } from './core/config/swagger.config';
import { RolesGuard } from './core/auth/guards/roles.guard';
import { Transport } from '@nestjs/microservices';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

    // Configuration Swagger
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, document, {
  swaggerOptions: {
    persistAuthorization: true,
    defaultModelsExpandDepth: -1

  },
});

  app.connectMicroservice({
    transport: Transport.TCP,
    options: {
      host: '0.0.0.0',
      port: 3002, // port pour recevoir des requêtes TCP
    },
  });

  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Authorization'],
    credentials: true,
  });
  const reflector = app.get(Reflector);
  app.useGlobalGuards(new RolesGuard(reflector));  

  await app.startAllMicroservices(); // démarre le microservice TCP

  await app.listen(process.env.PORT ?? 3000);

}
bootstrap();
