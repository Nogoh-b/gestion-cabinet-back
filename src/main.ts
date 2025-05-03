import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule } from '@nestjs/swagger';
import { swaggerConfig } from './core/config/swagger.config';
import { RolesGuard } from './core/auth/guards/roles.guard';
import { UPLOAD_PATH } from './core/common/constants/constants';

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


  app.enableCors({
    origin: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE',
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Authorization'],
    credentials: true,
  });
  const reflector = app.get(Reflector);
  app.useGlobalGuards(new RolesGuard(reflector));
  

  console.log('App is running on: http://localhost:3000 ', UPLOAD_PATH);
  


/*app.useGlobalInterceptors(
  FileInterceptor('file', {  // Pas besoin de 'new'
    limits: {
      fileSize: 1024 * 1024 * 5, // 5MB
    },
    fileFilter: (req, file, cb) => {
      if (file.mimetype.match(/\/(jpg|jpeg|png|pdf)$/)) {
        cb(null, true);  // Accepte le fichier
      } else {
        cb(new Error('File type not allowed'), false);  // Rejette le fichier
      }
    },
  })
);*/
  
  /*app.useGlobalPipes(new ValidationPipe({
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
  }));*/
  

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
