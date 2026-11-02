# Déploiement — Application KabySoft (Cabisoft Manager) et espace admin plateforme

Ce document décrit le déploiement complet de l'application : **API NestJS** (`gestion-cabinet-back`),
**front Next.js** (`gestion-cabinet-front`) et **espace super admin `/platform`** (servi par les deux mêmes
applications : il n'y a pas de troisième service à déployer).

> Règles d'or
> - Ne jamais committer de `.env` ni de secret.
> - Toujours **sauvegarder la base** avant de jouer des migrations.
> - Le démarrage du back **ne joue pas les migrations** : elles se lancent à part (`npm run migration:run:prod`), avant le redémarrage.
> - `PAYMENT_CONFIG_ENCRYPTION_KEY` et `AI_CONFIG_ENCRYPTION_KEY` chiffrent des données en base : **ne jamais les changer** une fois des données enregistrées.

---

## 1. Architecture

```
                 ┌───────────────────────── Nginx (TLS) ─────────────────────────┐
 navigateur ───▶ │ cabisoft-manager.com        → front Next.js (PM2)  :PORT_FRONT │
                 │ back.cabisoft-manager.com   → API NestJS (PM2)     :PORT_BACK  │
                 └────────────────────────────────────────────────────────────────┘
                                    │
          API NestJS ── MySQL/MariaDB (utf8mb4) ── Redis (files Bull, cache)
                     ── SMTP (e-mails, OTP admin plateforme)
                     ── fournisseurs IA (DeepSeek, Gemini, FreeLLM…), AssemblyAI
                     ── passerelles de paiement (CinetPay, NotchPay, Stripe) → webhooks
                     ── stockage local : uploads/, storage/, backups/
```

| Espace | URL front | Routes API | Authentification |
|---|---|---|---|
| Cabinets (avocats, personnel) | `/t/<code-cabinet>/…` | toutes sauf `/platform/*` | `JWT_SECRET` |
| Portail client | `/t/<code>/…` (comptes clients) | routes `@AllowClient()` | `JWT_SECRET` |
| **Admin plateforme** | `/platform/login`, `/platform/…` | `/platform/*` | `PLATFORM_JWT_SECRET` + code OTP par e-mail |

Environnements existants :

| Env | Dossier serveur | Branche | Back (PM2 / port) | Front (PM2 / port) | URLs |
|---|---|---|---|---|---|
| DEV | `/www/wwwroot/cabisoft_back_dev` | `dev` | `cabisoft-back-dev` / 3006 | `kaby-front_dev` / 3001 | `backend-dev.cabisoft-manager.com`, `dev.cabisoft-manager.com` |
| PROD | `/www/wwwroot/cabisoft` | `main` | voir `/root/deploy-scripts/deploy-back.sh` | idem | `back.cabisoft-manager.com`, `cabisoft-manager.com` |

---

## 2. Prérequis serveur

| Composant | Version / remarque |
|---|---|
| OS | Linux x64 (Debian/Ubuntu ; le serveur actuel utilise aaPanel) |
| Node.js | **20 LTS** (même version que le `Dockerfile`) |
| Outils de build natifs | `python3 make g++` (bcrypt, sharp, sqlite3) |
| MySQL / MariaDB | MySQL 8 ou MariaDB 10.6+, charset `utf8mb4`, ROW_FORMAT DYNAMIC |
| Clients MySQL | `mysql` et `mysqldump` dans le PATH (sauvegardes de `/platform/sauvegardes`, script de déploiement). Sinon `MYSQL_PATH` / `MYSQLDUMP_PATH` |
| Redis | 6+, sur `127.0.0.1` (le code Bull ne transmet **pas** de mot de passe Redis : garder Redis en écoute locale uniquement) |
| PM2 | `npm i -g pm2` + `pm2 startup` + `pm2 save` |
| Nginx | reverse proxy TLS (Let's Encrypt) |
| `openssl` | génération des secrets |

Le serveur doit pouvoir sortir en HTTPS vers les API IA, AssemblyAI, les passerelles de paiement et le SMTP.
L'OCR (tesseract.js, données `fra`/`eng`) est embarqué dans `node_modules` : rien à installer.
Prévoir ~150 Mo de RAM par worker OCR (`OCR_WORKERS`, 2 par défaut) en plus du process Node.

---

## 3. Base de données

```sql
CREATE DATABASE kabysoft CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'kabysoft'@'localhost' IDENTIFIED BY '<mot-de-passe-fort>';
GRANT ALL PRIVILEGES ON kabysoft.* TO 'kabysoft'@'localhost';
FLUSH PRIVILEGES;
```

- Le schéma est géré **uniquement par les migrations TypeORM** (`src/migrations`, table `migrations`).
  En production, `synchronize` est forcé à `false` (`src/data-source.ts`) même si `SYNCHRONIZE=true`.
- Le fuseau utilisé par la connexion est `+01:00` (WAT).
- Au démarrage, le back applique `ALTER TABLE notifications ROW_FORMAT=DYNAMIC` (sans effet si déjà fait).
- Les permissions, rôles et référentiels sont créés **par cabinet**, à la création du cabinet (TenantSeederService).
  Seuls les **plans** et la **géographie** sont globaux : ils se seedent au démarrage si `RUN_SEEDERS=true`
  (à activer pour la première installation, puis repasser à `false`).

---

## 4. Variables d'environnement du back (`gestion-cabinet-back/.env`)

Modèle : [`.env.example`](../.env.example). Lignes en **LF** de préférence (le `.env` du VPS dev est en CRLF :
les scripts le tolèrent, mais éviter d'en créer de nouveaux ainsi).

Générer un secret : `openssl rand -hex 32`

### 4.1 Obligatoires

| Variable | Rôle | Contraintes |
|---|---|---|
| `NODE_ENV` | `production` en prod (active les contrôles de secrets, coupe Swagger) | |
| `PORT` | port HTTP de l'API | défaut 3004 |
| `DB_HOST` `DB_PORT` `DB_USER` `DB_PASSWORD` `DB_NAME` | connexion MySQL | |
| `JWT_SECRET` | jetons des utilisateurs cabinets/clients | ≥ 24 car., refusé en prod si absent ou faible |
| `PLATFORM_JWT_SECRET` | jetons de l'admin plateforme | ≥ 24 car., **différent** de `JWT_SECRET` |
| `PAYMENT_CONFIG_ENCRYPTION_KEY` | chiffre les clés des passerelles de paiement en base | ≥ 32 car., **immuable** |
| `APP_FRONTEND_URL` | URL publique du front (invitations, retours de paiement, liens e-mail) | ex. `https://cabisoft-manager.com` |
| `API_PUBLIC_URL` | URL publique de l'API (URL de webhook déclarée aux passerelles) | ex. `https://back.cabisoft-manager.com` |
| `CORS_ORIGINS` | origines front autorisées, séparées par virgules | jamais `*` en prod |
| `BULL_REDIS_HOST` `BULL_REDIS_PORT` `BULL_REDIS_DB` `BULL_QUEUE_PREFIX` | Redis des files | préfixe distinct par environnement |
| `SMTP_HOST` `SMTP_PORT` `SMTP_SECURE` `SMTP_USER` `SMTP_PASSWORD` `MAIL_FROM` | e-mails (dont **codes OTP de connexion à `/platform`**) | `SMTP_HOST` doit figurer dans le certificat TLS du serveur SMTP (ex. `cabisoft-manager.com`, pas `mail.…`) |

### 4.2 Fortement recommandées

| Variable | Rôle |
|---|---|
| `PAYMENT_TEST_ENABLED=false` | coupe la passerelle de simulation et les outils DEV (actifs par défaut hors prod) |
| `AI_CONFIG_ENCRYPTION_KEY` | chiffre les clés IA saisies dans `/platform/ia` (≥ 32 car., immuable) |
| `BULL_BOARD_USER` / `BULL_BOARD_PASSWORD` | accès à `/admin/queues` (inaccessible en prod sans eux) |
| `UPLOADS_SIGNING_SECRET` | signature des URL de fichiers (sinon `JWT_SECRET` est réutilisé) ; `UPLOADS_URL_TTL_SECONDS` durée de validité |
| `PLATFORM_NAME`, `PLATFORM_CURRENCY` (`XAF`), `PLATFORM_JWT_EXPIRES_IN` (`8h`) | espace plateforme |
| `PLATFORM_OWNER_EMAIL` / `PLATFORM_OWNER_NAME` / `PLATFORM_OWNER_PASSWORD` | création automatique du Propriétaire au premier déploiement (voir §7). Retirer le mot de passe du `.env` une fois le compte créé |
| `BACKUP_DIR` | dossier des sauvegardes (défaut `./backups`) |
| `BASE_DOMAIN` | domaine de base (sous-domaines cabinets) |
| `RUN_SEEDERS` | `true` uniquement à la première installation (plans + géographie) |

### 4.3 IA (valeurs de repli — la configuration réelle se fait dans `/platform/ia`)

Le moteur IA est choisi par la plateforme (moteur par défaut + surcharge par cabinet). Les variables ne servent
que de repli :

- Clés : `DEEPSEEK_API_KEY`, `GEMINI_API_KEY` / `GOOGLE_API_KEY`, `FREELLM_API_KEY`, `META_API_KEY`, `GLM_API_KEY`, `MIMO_API_KEY`, `XAI_API_KEY`…
- URLs : `AI_DEEPSEEK_BASE_URL`, `FREELLM_BASE_URL`, `META_BASE_URL`, `AI_GLM_BASE_URL`, `MIMO_BASE_URL`…
- Modèles : `AI_FLASH_MODEL`, `AI_PRECISE_MODEL`, `AI_FAST_MODEL`, `AI_QUALITY_MODEL`, `AI_STREAM_MODEL`
- Réglages : `AI_TIMEOUT_MS`, `AI_MAX_RETRIES`, `AI_TEMPERATURE`, `AI_MAX_TOKENS`, `AI_CHAT_SHOW_SQL=false` (diagnostic uniquement)
- Vision / OCR : `AI_VISION_*`, `OCR_WORKERS`
- Transcription audio : `ASSEMBLYAI_API_KEY` (+ `ASSEMBLYAI_BASE_URL` pour l'UE), `AI_ASR_LANGUAGE`, sinon Gemini ou `AI_ASR_*`

Le détail de chaque variable est commenté dans `.env.example`.

### 4.4 Optionnelles / héritées

`RATE_LIMIT_TTL`, `RATE_LIMIT_MAX`, `CLEANUP_UNPAID_CABINETS_DAYS`, `MICROSERVICE_HOST`/`MICROSERVICE_PORT`,
`COMPANY_NAME`/`COMPANY_ADDRESS`/`COMPANY_EMAIL`/`COMPANY_PHONE`/`COMPANY_LOGO_URL` (en-têtes de documents),
`MAX_FILE_SIZE`, `UPLOAD_PATH`, `STORAGE_PROVIDER`/`STORAGE_LOCAL_PATH` (+ `S3_*` si stockage S3),
`ENDPOINT_MCOTI`/`CUSTOMER_KEY_DISBURSEMENT`/`CUSTOMER_SECRET_DISBURSEMENT` (API Mendo Coti),
`FEATURE_*` (drapeaux de fonctionnalités), `JWT_EXPIRES_IN`, `JWT_REFRESH_EXPIRES_IN`.

Exemple minimal de production :

```dotenv
NODE_ENV=production
PORT=3004
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=kabysoft
DB_PASSWORD=<...>
DB_NAME=kabysoft
SYNCHRONIZE=false
JWT_SECRET=<openssl rand -hex 32>
PLATFORM_JWT_SECRET=<openssl rand -hex 32, différent>
PAYMENT_CONFIG_ENCRYPTION_KEY=<openssl rand -hex 32>
AI_CONFIG_ENCRYPTION_KEY=<openssl rand -hex 32>
UPLOADS_SIGNING_SECRET=<openssl rand -hex 32>
APP_FRONTEND_URL=https://cabisoft-manager.com
API_PUBLIC_URL=https://back.cabisoft-manager.com
CORS_ORIGINS=https://cabisoft-manager.com,https://www.cabisoft-manager.com
BULL_REDIS_HOST=127.0.0.1
BULL_REDIS_PORT=6379
BULL_REDIS_DB=0
BULL_QUEUE_PREFIX=kabysoft-prod
BULL_BOARD_USER=<...>
BULL_BOARD_PASSWORD=<...>
SMTP_HOST=cabisoft-manager.com
SMTP_PORT=465
SMTP_SECURE=true
SMTP_USER=<...>
SMTP_PASSWORD=<...>
MAIL_FROM="Cabisoft Manager" <no-reply@cabisoft-manager.com>
PLATFORM_NAME=Cabisoft Manager
PLATFORM_CURRENCY=XAF
PAYMENT_TEST_ENABLED=false
RUN_SEEDERS=false
```

---

## 5. Variables du front (`gestion-cabinet-front/.env.production.local` ou `.env.local`)

Les variables `NEXT_PUBLIC_*` sont **figées au moment du build** : toute modification impose un `npm run build`.

| Variable | Rôle |
|---|---|
| `NEXT_PUBLIC_API_URL` | URL publique de l'API (obligatoire ; sert aussi à construire la CSP `connect-src`) |
| `NEXT_PUBLIC_SOCKET_URL` | URL Socket.IO (notifications temps réel) ; par défaut = API |
| `NEXT_PUBLIC_BASE_DOMAIN` | domaine de base (résolution des cabinets) |
| `NEXT_PUBLIC_PLATFORM_CURRENCY` | devise affichée dans `/platform` (ex. `XAF`) |

Sans `NEXT_PUBLIC_API_URL`, la CSP retombe sur `https://back.cabisoft-manager.com` : un build de dev mal
configuré appellerait donc la prod.

---

## 6. Installation initiale (serveur vierge)

```bash
# 1. Code
mkdir -p /www/wwwroot/cabisoft && cd /www/wwwroot/cabisoft
git clone <repo-back>  gestion-cabinet-back
git clone <repo-front> gestion-cabinet-front
(cd gestion-cabinet-back && git checkout main)
(cd gestion-cabinet-front && git checkout main)

# 2. Back
cd gestion-cabinet-back
cp .env.example .env            # puis renseigner (§4) ; RUN_SEEDERS=true pour ce premier démarrage
npm install --legacy-peer-deps
npm run build                   # nest build -> dist/
npm run migration:run:prod      # crée tout le schéma, dont les tables platform_*
npm run platform:create-owner   # compte Propriétaire de /platform (§7)
mkdir -p uploads storage backups
pm2 start dist/src/main.js --name cabisoft-back
#   Le premier démarrage peut prendre 1 à 2 min (seeders). Vérifier : pm2 logs cabisoft-back
#   Puis remettre RUN_SEEDERS=false et : pm2 restart cabisoft-back --update-env

# 3. Front
cd ../gestion-cabinet-front
#   créer .env.production.local (§5)
npm install
npm run build                   # next build --turbopack
PORT=3000 pm2 start npm --name cabisoft-front -- start

# 4. Persistance PM2
pm2 save && pm2 startup
```

### Nginx

```nginx
# API
server {
  server_name back.cabisoft-manager.com;
  client_max_body_size 50m;               # pièces jointes / logos (corps JSON limité à 15 Mo côté API)

  location / {
    proxy_pass http://127.0.0.1:3004;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    # WebSocket (Socket.IO)
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    # Streaming SSE du chat IA : pas de mise en tampon
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 300s;
  }
  # listen 443 ssl; certificats Let's Encrypt (certbot --nginx)
}

# Front (inclut l'espace /platform)
server {
  server_name cabisoft-manager.com www.cabisoft-manager.com;
  location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
```

L'API fait confiance au premier proxy (`trust proxy = 1`) : ne pas exposer le port Node directement.
Bloquer depuis l'extérieur les ports Node, MySQL (3306) et Redis (6379).

---

## 7. Espace admin plateforme (`/platform`)

### 7.1 Ce qui le compose

- **Back** : module `src/modules/platform` (routes `/platform/*`), tables `platform_admins`, `platform_admin_tokens`,
  plans, abonnements, `subscription_payments`, coupons, moyens de paiement, crédits IA… créées par les migrations.
- **Front** : `app/platform` (`/platform/login`, `/platform/set-password`, console). Le middleware Next ne préfixe
  jamais `/platform` par un code cabinet.
- Pages de la console : tableau de bord, cabinets, abonnements, plans, paiements, revenus, coupons, moyens de
  paiement, services payants (crédits IA), IA, consommation IA, référentiels, sauvegardes, administrateurs, audit, paramètres.

### 7.2 Premier Propriétaire

Aucun identifiant n'est codé en dur. Deux façons :

```bash
cd gestion-cabinet-back
npm run platform:create-owner          # interactif (mot de passe 12+ car., maj/min/chiffre/spécial)
# ou non interactif :
PLATFORM_OWNER_EMAIL=... PLATFORM_OWNER_NAME="..." PLATFORM_OWNER_PASSWORD='...' npm run platform:create-owner
```

> ⚠️ Le script **réinitialise le mot de passe** d'un compte existant avec le même e-mail. Ne pas le relancer sur
> une base qui a déjà un Propriétaire actif (le script de déploiement dev le vérifie avant).

Connexion : `https://<front>/platform/login` → e-mail + mot de passe → **code OTP reçu par e-mail** (le SMTP doit
fonctionner). Les autres administrateurs s'invitent depuis `/platform/administrateurs` (rôles `owner`, `finance`,
`support`) ; ils reçoivent un lien vers `/platform/set-password` construit avec `APP_FRONTEND_URL`.

### 7.3 Paramétrage après la première connexion

1. **Plans** (`/platform/plans`) : vérifier les plans seedés, prix, modules (dont `IA activée`), « Crédits IA / mois ».
2. **Moyens de paiement** (`/platform/moyens-paiement`) : saisir les clés CinetPay / NotchPay / Stripe (chiffrées
   avec `PAYMENT_CONFIG_ENCRYPTION_KEY`) et déclarer chez chaque passerelle l'URL de webhook :
   `{API_PUBLIC_URL}/payments/webhooks/<provider>` (ex. `https://back.cabisoft-manager.com/payments/webhooks/stripe`).
   Les retours navigateur passent par `{API_PUBLIC_URL}/payments/return/<provider>` puis redirigent vers `APP_FRONTEND_URL`.
3. **IA** (`/platform/ia`) : moteur par défaut, clés des fournisseurs, valeur du crédit IA, tarifs par modèle
   (consommation suivie dans `/platform/consommation-ia`).
4. **Services payants** (`/platform/services-payants`) : packs de crédits IA.
5. **Sauvegardes** (`/platform/sauvegardes`) : vérifier qu'une sauvegarde manuelle réussit (`mysqldump` accessible,
   `BACKUP_DIR` inscriptible).
6. **Paramètres** : nom de la plateforme, devise, e-mails de facturation.

> Les événements d'abonnement envoient des e-mails réels aux administrateurs de cabinet : ne pas confirmer de
> paiements de test sur de vrais cabinets.

---

## 8. Mise à jour (déploiement courant)

### 8.1 DEV — script `deploy-cabisoft-dev.sh`

Script local (`E:\Brice\KabySoft\deploy-cabisoft-dev.sh`, hors git), copié sur le VPS par `scp`.

```bash
./deploy-cabisoft-dev.sh                  # back + front
./deploy-cabisoft-dev.sh back             # back seul
./deploy-cabisoft-dev.sh front            # front seul
./deploy-cabisoft-dev.sh --skip-migrations
./deploy-cabisoft-dev.sh --init-env       # ajoute PLATFORM_JWT_SECRET / PAYMENT_CONFIG_ENCRYPTION_KEY s'ils manquent
./deploy-cabisoft-dev.sh --backfill-iam   # rattrape les permissions par défaut des cabinets existants
./deploy-cabisoft-dev.sh --fix-iam        # répare les liaisons IAM cross-tenant (backup + scripts/fix-iam-prod.sql)
```

Il enchaîne : `git stash` des modifs locales → merge de `origin/dev` (conflits de lockfiles résolus côté origin) →
contrôle des `.env` → `npm install` → build → migrations → création du Propriétaire s'il n'en existe aucun →
`pm2 restart` → vérifications (`/platform/auth/me` doit répondre 401, `/platform/login` 200).

Le lancer avec `nohup … > deploy.log 2>&1 &` (le back met 1 à 2 min à écouter) et faire un dump de la base avant.

### 8.2 PROD

1. Merger `dev` → `main` après recette.
2. Sauvegarder : base (`mysqldump --single-transaction kabysoft > /root/backups-prod/…sql`), `.env` du back,
   `.env.local` du front.
3. Si de nouvelles variables obligatoires sont apparues, les ajouter au `.env` (pour l'espace plateforme :
   `prod-prep.sh`, idempotent, ajoute les secrets manquants sans les afficher).
4. Lancer `/root/deploy-scripts/deploy-back.sh` puis le script front. Séquence équivalente à la main :

```bash
cd /www/wwwroot/cabisoft/gestion-cabinet-back
git pull origin main
npm install --legacy-peer-deps
npm run build
npm run migration:show:prod     # liste des migrations en attente : à relire
npm run migration:run:prod      # s'arrête à la première erreur ; l'ancien process tourne toujours
pm2 restart <pm2-back> --update-env

cd ../gestion-cabinet-front
git pull origin main
npm install
npm run build
pm2 restart <pm2-front> --update-env
```

5. Vérifications (§10).

### 8.3 Scripts de maintenance utiles

| Commande (dans le back) | Usage |
|---|---|
| `npm run migration:show:prod` | migrations jouées / en attente |
| `npm run migration:revert:prod` | annule la **dernière** migration |
| `npm run iam:backfill-defaults` | ajoute les permissions par défaut manquantes aux cabinets (idempotent) |
| `npm run billing:reconcile` | rapprochement de facturation |
| `npm run reference-data:check` | contrôle des données de référence |
| `npm run diag:login` | diagnostic d'un échec de connexion |

---

## 9. Variante Docker (back)

Le `Dockerfile` du back construit une image Node 20 multi-étapes ; au démarrage du conteneur, il joue
`node dist/src/run-migrations.js` **puis** lance `node dist/src/main.js` (le conteneur s'arrête si une migration échoue).

```bash
docker build -t kabysoft-back .
docker run -d --name kabysoft-back --env-file .env -p 3004:3004 \
  -v /srv/kabysoft/uploads:/app/uploads -v /srv/kabysoft/backups:/app/backups \
  kabysoft-back
```

- MySQL et Redis doivent être joignables depuis le conteneur (`DB_HOST` / `BULL_REDIS_HOST` ≠ `localhost`).
- L'image n'inclut pas `mysqldump` : les sauvegardes de `/platform/sauvegardes` ne fonctionneront pas sans
  l'ajouter (`apt-get install default-mysql-client`).
- Le healthcheck interroge `/api-docs`, désactivé quand `NODE_ENV=production` (réponse 404, donc < 500 : considéré sain).
- La création du Propriétaire se fait par `docker exec` avec les variables `PLATFORM_OWNER_*` (le script utilise
  `ts-node`, absent de l'image de production : le lancer depuis un poste ayant le code source et l'accès à la base).

---

## 10. Vérifications après déploiement

```bash
pm2 list                                                     # process "online", pas de redémarrages en boucle
pm2 logs <pm2-back> --lines 100                              # "HTTP en écoute sur <port>", aucune erreur [SECURITE]
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:<port-back>/platform/auth/me   # 401
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:<port-front>/platform/login    # 200
npm run migration:show:prod                                  # plus aucune migration en attente
```

Recette fonctionnelle rapide :

- [ ] connexion à un cabinet (`/t/<code>/…`) et ouverture d'un dossier ;
- [ ] téléchargement d'un document (URL signée) ;
- [ ] notification temps réel reçue (Socket.IO) ;
- [ ] question au chat IA (réponse en streaming, pas de mise en tampon Nginx) ;
- [ ] connexion à `/platform/login` avec réception du code OTP ;
- [ ] tableau de bord `/platform` et liste des cabinets ;
- [ ] `/admin/queues` demande une authentification.

---

## 11. Sauvegarde et retour arrière

- **Base** : `mysqldump --single-transaction --routines <DB_NAME>` avant chaque déploiement ; en plus, les
  sauvegardes planifiées / manuelles de `/platform/sauvegardes` (dossier `BACKUP_DIR`).
- **Fichiers** : `uploads/` et `storage/` (pièces des dossiers, logos, documents générés) — à sauvegarder à part.
- **Secrets** : copie hors serveur du `.env` du back (perdre `PAYMENT_CONFIG_ENCRYPTION_KEY` ou
  `AI_CONFIG_ENCRYPTION_KEY` rend illisibles les clés de paiement / IA enregistrées).

Retour arrière :

1. Code : `git checkout <commit-précédent>` dans le dépôt concerné, puis build + `pm2 restart`.
2. Schéma : `npm run migration:revert:prod` autant de fois que de migrations à annuler (vérifier que chacune a un
   `down` correct), ou restauration du dump pris avant le déploiement.
3. Front : rebuild obligatoire (fichiers `.next` liés au code).

---

## 12. Dépannage

| Symptôme | Cause probable / action |
|---|---|
| Le back s'arrête au démarrage avec `[SECURITE] Secret obligatoire manquant` | variable du §4.1 absente ou < 24 caractères en `NODE_ENV=production` |
| `/platform/auth/me` → 404 | ancien build (`dist`) ou mauvais process PM2 : rebuild + restart |
| `/platform/login` redirige vers un cabinet | ancien build du front (middleware) : `npm run build` + restart |
| Pas de code OTP reçu | SMTP : vérifier `SMTP_HOST` (doit correspondre au certificat, sinon `ERR_TLS_CERT_ALTNAME_INVALID`), logs du back |
| Erreurs CORS dans le navigateur | ajouter l'origine exacte (schéma + domaine + port) à `CORS_ORIGINS`, restart avec `--update-env` |
| Le front appelle la mauvaise API / CSP bloque l'API | `NEXT_PUBLIC_API_URL` incorrect au moment du build : corriger puis rebuild |
| Chat IA qui « arrive d'un bloc » | `proxy_buffering off` manquant sur Nginx |
| `ER_BAD_FIELD_ERROR` / colonne inconnue après déploiement | migrations non jouées : `npm run migration:run:prod` |
| Webhook de paiement refusé (signature) | URL déclarée ≠ `{API_PUBLIC_URL}/payments/webhooks/<provider>`, ou proxy qui modifie le corps |
| Sauvegarde `/platform/sauvegardes` en échec | `mysqldump` introuvable (`MYSQLDUMP_PATH`) ou `BACKUP_DIR` non inscriptible |
| `git pull` en conflit sur `package-lock.json` / `yarn.lock` | prendre la version d'origine (`git checkout --theirs`) puis réinstaller |
| Back lent à répondre après restart | normal (1 à 2 min) ; surveiller `pm2 logs` |
