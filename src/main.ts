import * as dotenv from 'dotenv';
import * as express from 'express';
import helmet from 'helmet';
import { DataSource } from 'typeorm';
import { ExpressAdapter } from '@bull-board/express';
import { ClassSerializerInterceptor } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';

import { Transport } from '@nestjs/microservices';

import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule } from '@nestjs/swagger';










import { AppModule } from './app.module';
import { swaggerConfig } from './core/config/swagger.config';
import LocationSeeder from './modules/geography/seeder/location.seeder';









// seedDatabase a été remplacé par TenantSeederService (exécuté à la création de chaque cabinet)
// import { seedDatabase } from './main.seeder';



dotenv.config();

async function fixRowFormat() {
  const mysql = await import('mysql2/promise');
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'core_banking',
  });
  try {
    await conn.execute('ALTER TABLE notifications ROW_FORMAT=DYNAMIC');
    console.log('✅ notifications ROW_FORMAT=DYNAMIC applied');
  } catch (err: any) {
    // Already DYNAMIC, or table doesn't exist yet — both are fine
    if (!err.message?.includes('already') && !err.message?.includes("doesn't exist")) {
      console.warn('ROW_FORMAT fix skipped:', err.message);
    }
  } finally {
    await conn.end();
  }
}

async function bootstrap() {
  await fixRowFormat();
  // bodyParser:false → on remplace le parser par défaut (limite 100kb) par le nôtre
  // avec une limite large, pour accepter les logos envoyés en data-URI base64.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });
  app.use(express.json({ limit: '15mb' }));
  app.use(express.urlencoded({ limit: '15mb', extended: true }));

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
    index: false,            // ne sert jamais d'index.html
    dotfiles: 'ignore',      // ignore les fichiers cachés
    setHeaders: (res) => {
      res.setHeader('Content-Disposition', 'attachment');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Cache-Control', 'no-store');
    },
  });
  app.use('/uploads', uploadsStatic);

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

  // ── Seeders globaux ──────────────────────────────────────────────────────
  // Permissions, rôles et données de référence métier sont désormais seedés
  // par TenantSeederService à la CRÉATION de chaque cabinet (multi-tenant).
  // Seuls les Plans d'abonnement restent globaux (pas de tenant_id).
  if (process.env.RUN_SEEDERS === 'true') {
    const { default: PlanSeeder } = await import('./modules/plans/seeder/plan.seeder');
    const { runSeeders } = await import('typeorm-extension');
    await runSeeders(app.get(DataSource), { seeds: [PlanSeeder, LocationSeeder] });
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

  // CORS : liste blanche EXPLICITE d'origines.
  // Règle de sécurité : ne jamais utiliser origin: '*' avec credentials: true,
  // cela exposerait l'API à des requêtes authentifiées depuis n'importe quel site.
  const corsOrigins = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
    : [];
  const isDevelopment = process.env.NODE_ENV !== 'production';
  const isLocalDevelopmentOrigin = (origin: string): boolean =>
    isDevelopment && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if (process.env.NODE_ENV === 'production' && corsOrigins.includes('*')) { 
    console.warn(
      '⚠️  [SECURITE] CORS_ORIGINS contient "*" en production — configuration dangereuse. ' +
        'Définissez une liste explicite d\'origines.',
    );
  }
  app.enableCors({
    origin: (origin, callback) => {
      // Requests without Origin are server-to-server or same-origin. In local
      // development, accept localhost on any port; production stays explicit.
      const isAllowed =
        !origin ||
        corsOrigins.includes('*') ||
        corsOrigins.includes(origin) ||
        isLocalDevelopmentOrigin(origin);

      callback(null, isAllowed);
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    // En-têtes autorisés : on accepte les en-têtes standard envoyés par le
    // front (notamment cache-control/pragma pour le streaming SSE/IA, et les
    // en-têtes de négociation de contenu). Les en-têtes sont listés plutôt
    // que d'utiliser '*' qui est refusé par les navigateurs avec credentials.
    allowedHeaders:
      'Content-Type,Authorization,X-Tenant-Code,X-Requested-With,' +
      'Accept,Accept-Language,Cache-Control,Pragma,If-None-Match,Last-Event-ID',
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
