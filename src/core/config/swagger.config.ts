// core/config/swagger.config.ts
import { DocumentBuilder } from '@nestjs/swagger';


export const swaggerConfig = new DocumentBuilder()
  .setTitle('KabySoft Cabinet API')
  .setDescription(
    'API de gestion juridique, procédurale et comptable multi-cabinets',
  )
  .setVersion('3.0')
  .addBearerAuth()
  // En-tête multi-tenant : permet de tester avec différents cabinets
  // Valeur = code du cabinet (ex: "demo", "test-cabinet")
  // Utilisation : cliquer sur "Authorize" et saisir le code
  .addApiKey(
    {
      type: 'apiKey',
      in: 'header',
      name: 'x-tenant-code',
      description:
        'Code du cabinet (ex: m9d2hpar). Obligatoire hors routes globales.',
    },
    'x-tenant-code',
  )
  // Applique les deux schémas à TOUTES les routes automatiquement
  // Sans ça, Swagger affiche le champ Authorize mais n'envoie pas les headers
  .addSecurityRequirements('bearer')
  .addSecurityRequirements('x-tenant-code')
  .build();
  /*.setTitle('Core Banking API')
  .setDescription('API pour le système bancaire central')
  .setVersion('1.0')
  .addBearerAuth({
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    name: 'JWT',
    description: 'Enter JWT token',
    in: 'header'
  }, 'JWT-auth')
  .build();*/
