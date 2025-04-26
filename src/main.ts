import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule } from '@nestjs/swagger';
import { swaggerConfig } from './core/config/swagger.config';
import { RolesGuard } from './core/auth/guards/roles.guard';
import { ValidationError, ValidationPipe } from '@nestjs/common';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

    // Configuration Swagger
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api-docs', app, document, {
  swaggerOptions: {
    persistAuthorization: true,
  },
});
  app.enableCors({
  origin: '*', // ou 'http://localhost:4200' par exemple
  methods: 'GET,POST,PUT,DELETE',
  });
  const reflector = app.get(Reflector);
  app.useGlobalGuards(new RolesGuard(reflector));

  
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true, // enlève les champs inconnus
    forbidNonWhitelisted: true, // bloque les champs non listés
    transform: true, // transforme automatiquement l'objet en DTO
    exceptionFactory: (errors: ValidationError[]) => {
      const detailedErrors = errors.map(err => ({
        property: err.property,
        value: err.value,
        constraints: err.constraints,
        children: err.children,
      }));
      return new Error(JSON.stringify(detailedErrors, null, 2));
    }
  }));
  

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
