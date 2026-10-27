import * as dotenv from 'dotenv';
import * as express from 'express';
import helmet from 'helmet';
import { DataSource } from 'typeorm';
import { ClassSerializerInterceptor } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';

import { NestExpressApplication } from '@nestjs/platform-express';
import { Transport } from '@nestjs/microservices';
import { SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { swaggerConfig } from './core/config/swagger.config';
import { isCorsOriginAllowed } from './core/config/cors-origin';
import LocationSeeder from './modules/geography/seeder/location.seeder';
import { assertSafeMicroserviceBindHost } from './core/config/runtime-security';
import { RequestValidationPipe } from './core/shared/pipes/request-validation.pipe';
import { uploadsGuard } from './core/security/uploads-access';

// seedDatabase a été remplacé par TenantSeederService (exécuté à la création de chaque cabinet)
// import { seedDatabase } from './main.seeder';

dotenv.config();

async function bootstrap() {
  // bodyParser:false → on remplace le parser par défaut (limite 100kb) par le nôtre
  // avec une limite large, pour accepter les logos envoyés en data-URI base64.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  // Corps brut conservé : vérification des signatures de webhooks de paiement
  // (Stripe, NotchPay, CinetPay) calculées sur les octets exacts reçus.
  const keepRawBody = (req: any, _res: any, buf: Buffer) => {
    if (
      String(req.originalUrl ?? req.url ?? '').startsWith('/payments/webhooks/')
    ) {
      req.rawBody = Buffer.from(buf);
    }
  };
  app.use(express.json({ limit: '15mb', verify: keepRawBody }));
  app.use(
    express.urlencoded({ limit: '15mb', extended: true, verify: keepRawBody }),
  );
  // Validation globale : requêtes typées, propriétés inconnues refusées.
  app.useGlobalPipes(new RequestValidationPipe());

  // ── Sécurité : en-têtes HTTP via Helmet ──────────────────────────────────
  // Ajoute X-Content-Type-Options, X-Frame-Options (anti clickjacking),
  // Strict-Transport-Security (HSTS), masque X-Powered-By, etc.
  // contentSecurityPolicy désactivé ici car l'API sert surtout du JSON ;
  // le CSP doit être géré côté front Next.js.
  app.use(helmet({ contentSecurityPolicy: false }));
  // Refuser l'affichage de l'API dans des frames externes (anti-clickjacking).
  app.use(helmet.frameguard({ action: 'deny' }));

  // ── Trust proxy : récupération fiable de l'IP client et du schéma (https)
  // derrière un reverse proxy (Nginx, load balancer). Indispensable pour que
  // les logs, le rate limiting et les vérifications d'origine soient exacts.
  app.set('trust proxy', 1);

  // ── Service statique des uploads SÉCURISÉ ─────────────────────────────────
  // Les pièces de dossiers juridiques (PDF, images de CNI, conclusions...)
  // sont servies en forçant le téléchargement (Content-Disposition: attachment)
  // et en interdisant le sniffing de type (X-Content-Type-Options: nosniff).
  // Sans cela, un navigateur pourrait interpréter/exécuter un fichier malveillant
  // (HTML/SVG → XSS) affiché dans une iframe.
  const UPLOADS_DIR = require('path').join(process.cwd(), 'uploads');
  const uploadsStatic = express.static(UPLOADS_DIR, {
    index: false, // ne sert jamais d'index.html
    dotfiles: 'ignore', // ignore les fichiers cachés
    setHeaders: (res) => {
      res.setHeader('Content-Disposition', 'attachment');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'no-store');
    },
  });
  // Accès : logos de cabinet (`uploads/cabinets/`) publics, tout le reste sur
  // URL signée à durée limitée (voir core/security/uploads-access.ts).
  app.use('/uploads', uploadsGuard, uploadsStatic);

  // ── SSE / streaming : désactiver Nagle sur chaque nouvelle connexion TCP ──
  // setNoDelay doit être activé DÈS la création du socket, avant tout traitement
  // HTTP. Le faire dans le handler de requête (res.socket.setNoDelay) est trop
  // tard — le kernel peut déjà avoir bufferisé le paquet SYN-ACK initial.
  app.getHttpServer().on('connection', (socket) => {
    socket.setNoDelay(true);
    socket.uncork();
  });

  // Microservice TCP attaché à la MÊME instance NestJS (pas de second graph DI)
  const microserviceHost = process.env.MICROSERVICE_HOST || '127.0.0.1';
  assertSafeMicroserviceBindHost(microserviceHost);
  app.connectMicroservice({
    transport: Transport.TCP,
    options: {
      host: microserviceHost,
      port: parseInt(process.env.MICROSERVICE_PORT || '2999', 10),
    },
  });

  app.useGlobalInterceptors(new ClassSerializerInterceptor(app.get(Reflector)));

  // Les référentiels cabinets sont gérés par les profils publiés.
  // ── Seeders globaux ──────────────────────────────────────────────────────
  // Permissions, rôles et données de référence métier sont désormais seedés
  // par TenantSeederService à la CRÉATION de chaque cabinet (multi-tenant).
  // Seuls les Plans d'abonnement restent globaux (pas de tenant_id).
  if (process.env.RUN_SEEDERS === 'true') {
    const { default: PlanSeeder } = await import(
      './modules/plans/seeder/plan.seeder'
    );
    const { runSeeders } = await import('typeorm-extension');
    await runSeeders(app.get(DataSource), {
      seeds: [PlanSeeder, LocationSeeder],
    });
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
  const corsOrigins = (process.env.CORS_ORIGINS || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
  if (process.env.NODE_ENV === 'production' && corsOrigins.length === 0) {
    throw new Error(
      'CORS_ORIGINS doit être configuré explicitement en production',
    );
  }
  const allowedOrigins = corsOrigins.length
    ? corsOrigins
    : ['http://localhost:3000', 'http://127.0.0.1:3000'];
  // En développement uniquement : front servi depuis le poste ou le réseau local.
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const isLocalDevelopmentOrigin = (origin: string): boolean =>
    isDevelopment &&
    /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d+)?$/.test(
      origin,
    );
  app.enableCors({
    origin: (origin, callback) => {
      if (
        isCorsOriginAllowed(
          origin,
          allowedOrigins,
          process.env.NODE_ENV === 'production',
        ) ||
        (!!origin && isLocalDevelopmentOrigin(origin))
      ) {
        callback(null, true);
        return;
      }
      callback(new Error('Origine CORS non autorisée'), false);
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    // En-têtes autorisés : on accepte les en-têtes standard envoyés par le
    // front (notamment cache-control/pragma pour le streaming SSE/IA, et les
    // en-têtes de négociation de contenu). Les en-têtes sont listés plutôt
    // que d'utiliser '*' qui est refusé par les navigateurs avec credentials.
    allowedHeaders:
      'Content-Type,Authorization,X-Tenant-Code,X-Requested-With,' +
      'Accept,Accept-Language,Cache-Control,Pragma,If-None-Match,Last-Event-ID,' +
      'Idempotency-Key,If-Match',
  });

  const port = parseInt(process.env.PORT || '3004', 10);
  await app.startAllMicroservices();
  await app.listen(port);
  console.log(
    `✅ HTTP en écoute sur ${port}, microservice TCP sur ${process.env.MICROSERVICE_PORT || '2999'}`,
  );
}
bootstrap();
