# Déploiement du backend KabySoft — première installation sur un serveur

Ce guide décrit, de bout en bout, la mise en production **initiale** du backend
NestJS (`gestion-cabinet-back`) sur un serveur Linux neuf, puis la configuration
de l'espace plateforme (super admin). Le frontend a son propre guide :
`gestion-cabinet-front/docs/DEPLOIEMENT.md` — **commencez par celui-ci**, le
front a besoin de l'API pour fonctionner.

> Testé le 2026-10-26 sur une base MariaDB vierge : `schema:sync` →
> migrations « fake » → 3 migrations rejouées → seed → création du propriétaire
> → démarrage de l'API (`Nest application successfully started`).

---

## 0. Vue d'ensemble

```
                 Internet (443)
                      │
                  ┌───▼────┐
                  │ Nginx  │  TLS (Let's Encrypt)
                  └─┬────┬─┘
   app.<domaine>    │    │   back.<domaine>
        ┌───────────▼┐  ┌▼──────────────────┐
        │ Next.js    │  │ NestJS (API)      │
        │ :3000 (PM2)│─▶│ :3005 (PM2)       │── HTTP + Socket.IO + SSE (IA)
        └────────────┘  └──┬─────────┬──────┘
          /api/* → 127.0.0.1:3005    │
                      ┌────▼───┐ ┌───▼───┐
                      │MariaDB │ │ Redis │  (local, jamais exposés)
                      └────────┘ └───────┘
```

| Élément | Valeur retenue dans ce guide |
|---|---|
| OS | Debian 12 / Ubuntu 22.04+ |
| Node.js | 20 LTS (même version que le `Dockerfile` et la CI) |
| Base de données | MariaDB 10.6+ (le code utilise le driver `mariadb`) |
| File d'attente | Redis 6+ local (Bull) |
| Process manager | PM2 |
| Reverse proxy | Nginx + Certbot |
| Dossier d'installation | `/var/www/kabysoft/gestion-cabinet-back` |
| Port de l'API | **3005** (voir encadré) |
| Domaine API (exemple) | `back.cabisoft-manager.com` |
| Domaine front (exemple) | `cabisoft-manager.com` |

> **Pourquoi le port 3005 ?** Le front réécrit en dur `/api/*` vers
> `http://localhost:3005` (`next.config.ts`, utilisé par exemple pour
> `/api/upload`). Le back doit donc écouter sur **3005, sur la même machine**
> que le front. Le `Dockerfile` expose 3004 : ne vous y fiez pas pour un
> déploiement PM2.

> **aaPanel** : si le serveur est géré par aaPanel, les mêmes étapes
> s'appliquent (MariaDB, Redis, Node et Nginx s'installent depuis le panneau,
> les chemins sont alors `/www/wwwroot/...`). Les commandes ci-dessous restent
> valables dans le terminal SSH.

---

## 1. Préparer le serveur

### 1.0 Taille du serveur et fuseau horaire

Minimum conseillé pour le back, le front et la base sur la même machine :
**2 vCPU, 4 Go de RAM, 40 Go de disque**. Le build du front consomme à lui
seul environ 2 Go, et chaque lecteur OCR du chat environ 150 Mo
(`OCR_WORKERS=2`). Prévoyez de la place pour `uploads/` et les sauvegardes,
qui grossissent avec les pièces des cabinets.

Réglez le fuseau horaire du serveur sur celui des cabinets : les tâches
planifiées (rappels d'audience 48 h avant, relances) s'exécutent à l'heure du
serveur, et la connexion MariaDB de l'API est déjà en `+01:00`.

```bash
sudo timedatectl set-timezone Africa/Douala
timedatectl
```

### 1.1 Paquets système

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl build-essential python3 nginx mariadb-server mariadb-client redis-server ufw
```

- `build-essential` / `python3` : compilation des modules natifs (`bcrypt`, `sharp`, `sqlite3`).
- `mariadb-client` : fournit `mysqldump` / `mysql`, **indispensables** aux
  sauvegardes de l'application (module Sauvegarde). Si les binaires ne sont pas
  dans le `PATH`, renseignez `MYSQLDUMP_PATH` et `MYSQL_PATH` dans le `.env`.

### 1.2 Node.js 20 + PM2

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
node -v && npm -v && pm2 -v
```

### 1.3 Pare-feu

Seuls SSH, HTTP et HTTPS sont ouverts. **Ne jamais exposer** 3000, 3005, 3306 ni 6379.

```bash
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable
sudo ufw status
```

### 1.4 Redis (local, sans mot de passe, non exposé)

Le code ne transmet **pas** de mot de passe à Redis (`BullModule.forRoot` dans
`src/app.module.ts` n'utilise que host/port/db ; `BULL_REDIS_PASSWORD` est
ignoré). Redis doit donc rester **local** et écouter uniquement sur la boucle
locale :

```bash
sudo sed -i 's/^bind .*/bind 127.0.0.1 -::1/' /etc/redis/redis.conf
sudo sed -i 's/^protected-mode .*/protected-mode yes/' /etc/redis/redis.conf
sudo systemctl enable --now redis-server
redis-cli ping   # → PONG
```

### 1.5 MariaDB : base et utilisateur dédiés

```bash
sudo mysql_secure_installation
sudo mysql
```

```sql
CREATE DATABASE kabysoft CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'kabysoft'@'localhost' IDENTIFIED BY '<MOT_DE_PASSE_FORT>';
GRANT ALL PRIVILEGES ON kabysoft.* TO 'kabysoft'@'localhost';
FLUSH PRIVILEGES;
EXIT;
```

Augmenter la taille maximale d'une requête : les logos des cabinets sont
stockés en base, les pièces jointes des e-mails aussi, et l'API accepte des
corps jusqu'à 15 Mo. La valeur par défaut (16 Mo) est trop juste.

```bash
echo -e "[mysqld]\nmax_allowed_packet=64M" | sudo tee /etc/mysql/mariadb.conf.d/60-kabysoft.cnf
sudo systemctl restart mariadb
sudo mysql -e "SHOW VARIABLES LIKE 'max_allowed_packet';"   # 67108864 attendu
```

---

## 2. Récupérer le code et compiler

```bash
sudo mkdir -p /var/www/kabysoft && sudo chown -R $USER:$USER /var/www/kabysoft
cd /var/www/kabysoft
git clone <URL_DU_DEPOT_BACK> gestion-cabinet-back
cd gestion-cabinet-back
git checkout main
```

Installer **toutes** les dépendances (les devDependencies sont nécessaires :
`nest build` et les scripts `ts-node` d'administration) :

```bash
npm ci --include=dev
```

> Si `npm ci` échoue parce que `package-lock.json` n'est pas synchronisé,
> utilisez `npm install`. N'exportez pas `NODE_ENV=production` dans le shell
> avant l'installation : npm sauterait les devDependencies.

Créer les dossiers de données persistants (à sauvegarder, jamais versionnés) :

```bash
mkdir -p uploads storage/private backups backups-private logs
```

---

## 3. Fichier `.env` de production

```bash
cp .env.example .env
chmod 600 .env
nano .env
```

Générer chaque secret **séparément** (une valeur différente par variable) :

```bash
openssl rand -hex 48
```

### 3.1 Variables obligatoires

| Variable | Valeur de production | Rôle |
|---|---|---|
| `NODE_ENV` | `production` | Désactive Swagger, durcit CORS, coupe les passerelles de test |
| `PORT` | `3005` | Port d'écoute de l'API (voir § 0) |
| `SYNCHRONIZE` | `false` | **Jamais `true` en production** |
| `DB_HOST` / `DB_PORT` | `localhost` / `3306` | |
| `DB_USER` / `DB_PASSWORD` / `DB_NAME` | `kabysoft` / … / `kabysoft` | Utilisateur créé au § 1.5 |
| `JWT_SECRET` | 48+ octets aléatoires | Jetons des utilisateurs cabinet |
| `JWT_REFRESH_SECRET` | secret distinct | Jetons de rafraîchissement |
| `PLATFORM_JWT_SECRET` | secret **distinct** de `JWT_SECRET` | Espace plateforme (refusé en production s'il est identique) |
| `UPLOADS_SIGNING_SECRET` | secret distinct | Signature des URL de pièces jointes |
| `AI_CONFIG_ENCRYPTION_KEY` | secret distinct | Chiffrement des clés IA stockées en base |
| `PAYMENT_CONFIG_ENCRYPTION_KEY` | 32+ caractères | Chiffrement des clés des passerelles de paiement |
| `PAYMENT_TEST_ENABLED` | `false` | Coupe la passerelle de simulation |
| `CORS_ORIGINS` | `https://cabisoft-manager.com` | Liste **explicite** des fronts, séparés par des virgules. Jamais `*` |
| `APP_URL` / `APP_FRONTEND_URL` | `https://cabisoft-manager.com` | Liens d'invitation, d'accès client, retours de paiement |
| `API_PUBLIC_URL` / `API_HOST` | `https://back.cabisoft-manager.com` | URL publique de l'API (webhooks de paiement) |
| `BULL_REDIS_HOST` / `BULL_REDIS_PORT` / `BULL_REDIS_DB` | `127.0.0.1` / `6379` / `0` | |
| `BULL_QUEUE_PREFIX` | `kabysoft-prod` | Évite de mélanger les files avec un autre environnement |
| `BULL_BOARD_USER` / `BULL_BOARD_PASSWORD` | identifiants forts | Protègent `/admin/queues` (inaccessible sans) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` / `SMTP_USER` / `SMTP_PASSWORD` / `MAIL_FROM` | serveur d'envoi | **Indispensable** : la connexion à l'espace plateforme envoie un code OTP par e-mail |

> **SMTP** : `SMTP_HOST` doit correspondre exactement à un nom (SAN) du
> certificat TLS du serveur mail, sinon Node refuse la connexion
> (`ERR_TLS_CERT_ALTNAME_INVALID`).

> **Délivrabilité** : codes OTP, factures, relances et accès clients partent
> de l'adresse de `MAIL_FROM`. Déclarez dans le DNS de ce domaine un
> enregistrement **SPF**, la signature **DKIM** fournie par l'hébergeur mail
> et un **DMARC**, sinon ces e-mails finissent dans les spams. Vérifiez avec
> un envoi vers une boîte Gmail (« Afficher l'original » : SPF, DKIM et DMARC
> doivent être `PASS`).

Les variables `MAIL_HOST`, `MAIL_USER`… présentes dans d'anciens `.env` ne
sont pas lues : seules les `SMTP_*` comptent.

### 3.2 Intelligence artificielle (au moins un fournisseur)

Les clés des fournisseurs restent côté serveur, jamais envoyées au navigateur.
Le moteur actif se choisit ensuite dans **Plateforme → Intelligence
artificielle** ; les variables ci-dessous servent de clés et de repli.

| Variable | Usage |
|---|---|
| `DEEPSEEK_API_KEY` (+ `AI_DEEPSEEK_BASE_URL`) | Moteur par défaut (`AI_*_MODEL=deepseek-v4-flash/pro`) |
| `GOOGLE_API_KEY` (ou `GEMINI_API_KEY`) | Gemini ; sert aussi de repli pour la transcription audio |
| `GLM_API_KEY`, `META_API_KEY`, `FREELLM_API_KEY`, `MIMO_API_KEY`, `XAI_API_KEY` | Autres fournisseurs intégrés (facultatif) |
| `ASSEMBLYAI_API_KEY` | Transcription des dictées / fichiers audio du chat (facultatif) |
| `AI_VISION_*` | Imposer un modèle de lecture d'images / PDF scannés (facultatif ; sinon OCR local tesseract) |
| `OCR_WORKERS` | `2` (≈ 150 Mo de RAM chacun) |
| `AI_CHAT_SHOW_SQL` | `false` en production |

### 3.3 Variables facultatives utiles

| Variable | Usage |
|---|---|
| `RUN_SEEDERS` | Laisser **vide**. On utilise `npm run seed` une seule fois (§ 4) |
| `BACKUP_DIR` | Dossier des sauvegardes (défaut `./backups`) |
| `MYSQLDUMP_PATH` / `MYSQL_PATH` | Si `mysqldump` / `mysql` ne sont pas dans le `PATH` |
| `ENDPOINT_MCOTI`, `CUSTOMER_KEY_DISBURSEMENT`, `CUSTOMER_SECRET_DISBURSEMENT` | API de paiement Mendo Coti |
| `PLATFORM_NAME`, `PLATFORM_CURRENCY` | `KabySoft`, `XAF` |
| `RATE_LIMIT_TTL` / `RATE_LIMIT_MAX` | `60` / `100` par défaut |
| `CLEANUP_UNPAID_CABINETS_DAYS` | Purge des cabinets inscrits jamais payés |

### 3.4 Compiler

```bash
npm run build
ls dist/src/main.js dist/src/run-migrations.js dist/src/data-source.js
```

---

## 4. Initialiser la base de données (une seule fois)

Choisissez **un** des deux cas.

### Cas A — Nouveau serveur qui reprend une base existante (recommandé si l'application tourne déjà ailleurs)

Sur l'**ancien** serveur :

```bash
mysqldump --single-transaction --routines --triggers --default-character-set=utf8mb4 \
  -u <user> -p <ancienne_base> > kabysoft-$(date +%F).sql
tar czf kabysoft-fichiers-$(date +%F).tgz uploads storage backups backups-private
```

Transférer les deux fichiers (`scp`), puis sur le **nouveau** serveur :

```bash
mysql -u kabysoft -p kabysoft < kabysoft-AAAA-MM-JJ.sql
tar xzf kabysoft-fichiers-AAAA-MM-JJ.tgz -C /var/www/kabysoft/gestion-cabinet-back
node dist/src/run-migrations.js      # applique seulement les migrations manquantes
```

Le compte propriétaire, les plans, les moyens de paiement et les cabinets sont
repris avec la base : passez directement au § 5.

### Cas B — Base vierge (première installation de la plateforme)

Les migrations du dépôt **ne créent pas le schéma de base** : la première
(`1779107127070-UpdateCabinetLogoToLongtext`) modifie déjà une table
existante. Sur une base vide, `migration:run` seul échoue. La procédure
correcte est :

**1. Créer le schéma à partir des entités** (une seule fois, sur base vide) :

```bash
cd /var/www/kabysoft/gestion-cabinet-back
npx typeorm schema:sync -d dist/src/data-source.js
```

> ⚠️ **Ne relancez jamais `schema:sync` sur une base qui contient des
> données.** Il peut supprimer des colonnes ou des tables. Les évolutions
> suivantes passent uniquement par les migrations.

**2. Marquer toutes les migrations comme déjà appliquées** (le schéma issu des
entités est déjà à jour) :

```bash
npx typeorm migration:run -d dist/src/data-source.js --fake
```

**3. Rejouer les 3 migrations qui créent ce que les entités ne couvrent pas.**
`platform_impersonation_sessions` et `ai_request_calls` n'ont pas d'entité, et
`PlatformPaymentMethods` insère le catalogue des moyens de paiement. Ces trois
migrations sont idempotentes :

```bash
mysql -u kabysoft -p kabysoft -e "DELETE FROM migrations WHERE name IN ('PlatformPaymentMethods1791720000000','PlatformImpersonation1791750000000','AiUsageTracking1792600000000');"
node dist/src/run-migrations.js
```

Attendu : `Migrations appliquees : 3`.

**4. Vérifier** — toutes les lignes doivent être cochées `[X]` :

```bash
npx typeorm migration:show -d dist/src/data-source.js
mysql -u kabysoft -p kabysoft -e "SHOW TABLES LIKE 'ai_request_calls'; SHOW TABLES LIKE 'platform_impersonation_sessions'; SELECT code, is_active FROM platform_payment_methods;"
```

**5. Charger les catalogues partagés** (plans d'abonnement Starter / Cabinet /
Firme + géographie du Cameroun) :

```bash
npm run seed
```

Les permissions, rôles, référentiels métier, modèles PDF et blocs de mails ne
sont **pas** seedés ici : ils sont créés automatiquement au premier démarrage
(profil de référence « Standard — Cameroun ») puis copiés dans chaque cabinet à
sa création.

**6. Créer le compte Propriétaire de l'espace plateforme** :

```bash
npm run platform:create-owner
```

Le script demande e-mail, nom et mot de passe (12+ caractères avec majuscule,
minuscule, chiffre et caractère spécial). Mode non interactif possible avec
`PLATFORM_OWNER_EMAIL`, `PLATFORM_OWNER_NAME`, `PLATFORM_OWNER_PASSWORD`.
Relancé sur un e-mail existant, il le promeut Propriétaire et réinitialise son
mot de passe (utile en cas de perte d'accès).

---

## 5. Lancer l'API avec PM2

Créer `ecosystem.config.js` à la racine du back :

```js
module.exports = {
  apps: [
    {
      name: 'kabysoft-back',
      cwd: '/var/www/kabysoft/gestion-cabinet-back',
      script: 'dist/src/main.js',
      // UNE seule instance : l'API contient des tâches planifiées (@Cron)
      // qui s'exécuteraient en double en mode cluster.
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '2G',
      env: { NODE_ENV: 'production' },
      out_file: 'logs/out.log',
      error_file: 'logs/error.log',
      time: true,
    },
  ],
};
```

```bash
pm2 start ecosystem.config.js
pm2 logs kabysoft-back --lines 50
```

Au premier démarrage, les logs doivent contenir :

```
[ReferenceBootstrap] Profil initial capturé : … éléments
Nest application successfully started
✅ HTTP en écoute sur 3005
```

Des avertissements `[SchemaMetadataService] Impossible de lire métadonnées de
table pour …_documents` sont normaux (tables de jointure ignorées par l'IA).

Démarrage automatique au reboot :

```bash
pm2 save
pm2 startup systemd     # puis exécuter la commande sudo affichée
```

Rotation des logs PM2 :

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 50M
pm2 set pm2-logrotate:retain 14
```

Test local (route publique, doit renvoyer la liste des plans en JSON) :

```bash
curl -s http://127.0.0.1:3005/onboarding/plans | head -c 300
```

---

## 6. Nginx + HTTPS pour l'API

Le DNS `back.cabisoft-manager.com` doit pointer (enregistrement A) vers l'IP du serveur.

`/etc/nginx/conf.d/websocket-map.conf` :

```nginx
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}
```

`/etc/nginx/sites-available/kabysoft-back` :

```nginx
server {
    listen 80;
    server_name back.cabisoft-manager.com;

    # Pièces jointes, logos (data-URI) et documents envoyés au chat.
    client_max_body_size 50m;

    location / {
        proxy_pass http://127.0.0.1:3005;
        proxy_http_version 1.1;

        # Socket.IO (notifications temps réel, chat interne)
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Réponses de l'IA en streaming (SSE) : pas de mise en tampon.
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/kabysoft-back /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d back.cabisoft-manager.com
```

L'API fait déjà `trust proxy` : IP clientes, limitation de débit et HTTPS sont
correctement détectés derrière Nginx.

Vérifications :

```bash
curl -s https://back.cabisoft-manager.com/onboarding/plans | head -c 200   # JSON des plans
curl -I https://back.cabisoft-manager.com/api-docs        # 404 attendu : Swagger coupé en production
curl -I https://back.cabisoft-manager.com/admin/queues    # 401 attendu : Bull Board protégé
```

---

## 7. Partie administration — configurer la plateforme

Prérequis : le front est déployé (guide front) et le SMTP fonctionne.

### 7.1 Première connexion

1. Ouvrir `https://cabisoft-manager.com/platform/login`.
2. Se connecter avec le compte Propriétaire créé au § 4.6 : un **code OTP**
   est envoyé par e-mail. Pas d'e-mail reçu → vérifier `SMTP_*` puis
   `pm2 logs kabysoft-back`.

### 7.2 Ordre de configuration recommandé (console `/platform`)

| # | Page | Ce qu'il faut faire |
|---|---|---|
| 1 | **Paramètres** (`/platform/parametres`) | Nom de la plateforme, coordonnées, devise |
| 2 | **Intelligence artificielle** (`/platform/ia`) | Choisir le fournisseur / modèle par défaut parmi ceux dont la clé est dans le `.env`, vérifier l'état « Opérationnel ». Vérifier aussi le crédit restant sur le compte du fournisseur (DeepSeek, Google…) : sans crédit, le chat échoue |
| 2 bis | **Base de connaissance juridique** (même page) | **Importer un PDF** pour chaque texte de référence (Actes uniformes OHADA, AUPSRVE, Code civil, Code du travail…), 10 Mo maximum, avec une couche texte ou un scan lisible. Sans ces textes, le mode « Base de connaissance » et les analyses juridiques ne peuvent citer aucun article |
| 3 | **Plans** (`/platform/plans`) | Relire Starter / Cabinet / Firme : prix, durée d'essai, modules inclus, quotas IA, **Modèles IA du forfait** |
| 4 | **Services payants** (`/platform/services-payants`) | Crédits IA et options vendues à part |
| 5 | **Moyens de paiement** (`/platform/moyens-paiement`) | Les 6 moyens (virement, mobile money manuel, espèces, CinetPay, NotchPay, Stripe) sont créés **inactifs** : saisir les clés, passer en mode live, activer. URL de webhook à déclarer chez chaque passerelle : `https://back.cabisoft-manager.com/payments/webhooks/<provider>` (`cinetpay`, `notchpay`, `stripe`) |
| 6 | **Coupons** (`/platform/coupons`) | Codes promo (facultatif) |
| 7 | **Référentiels** (`/platform/referentiels`) | Le profil « Standard — Cameroun » a été capturé au 1er démarrage. Relire rôles, permissions, procédures, modèles ; **publier** et marquer « par défaut » : c'est lui qui est copié dans chaque nouveau cabinet |
| 8 | **Administrateurs** (`/platform/administrateurs`) | Inviter les autres administrateurs / le support (lien d'invitation → `/platform/set-password`) |
| 9 | **Sauvegardes** (`/platform/sauvegardes`) | Lancer une première sauvegarde pour vérifier `mysqldump` |

Pages de suivi ensuite : **Cabinets**, **Abonnements**, **Paiements**,
**Revenus**, **Consommation IA**, **Audit**.

### 7.3 Créer le premier cabinet

- Parcours public : `https://cabisoft-manager.com/onboarding` (inscription +
  choix du plan, essai gratuit de 30 jours). Le cabinet est initialisé depuis
  le profil de référence par défaut et reçoit un code (URL `/t/<code>/…`).
- L'administrateur du cabinet se connecte ensuite via `/auth/login` (l'e-mail
  suffit à retrouver son cabinet).

### 7.4 Côté administrateur du cabinet (`/admin`)

| Page | Action |
|---|---|
| **Configuration SMTP** (`/admin/smtp`) | SMTP propre au cabinet (factures, relances, accès clients), puis **e-mail de test** |
| **Authentification** (`/admin/security`) | Activer la double authentification (OTP e-mail) |
| **Utilisateurs / Rôles & permissions** | Créer les collaborateurs, ajuster les rôles |
| **Moteur IA** (`/admin/ai`) | Vérifier l'état du moteur, activer les contextes de l'assistant, ajouter les consignes du cabinet |
| **Sauvegarde** (`/admin/backup`) | Sauvegarde du cabinet, à télécharger régulièrement hors serveur |
| **Audit** (`/admin/audit`) | Journal de qui a fait quoi |

---

## 8. Mises à jour suivantes (déploiement courant)

À partir de la 2ᵉ livraison, **plus de `schema:sync`** : uniquement les migrations.

`deploy-back.sh` :

```bash
#!/usr/bin/env bash
set -euo pipefail
cd /var/www/kabysoft/gestion-cabinet-back

echo "$(date) — sauvegarde de la base"
mysqldump --single-transaction --routines --triggers -u kabysoft -p"$DB_PASSWORD" kabysoft \
  | gzip > backups/predeploy-$(date +%F-%H%M).sql.gz

git fetch --all
git reset --hard origin/main
npm ci --include=dev
npm run build

# Fail-fast : si une migration échoue, on ne redémarre pas sur un schéma obsolète.
node dist/src/run-migrations.js

pm2 restart kabysoft-back --update-env
pm2 logs kabysoft-back --lines 30 --nostream
echo "✅ Back déployé — $(date)"
```

```bash
chmod +x deploy-back.sh
DB_PASSWORD='<mot_de_passe_db>' ./deploy-back.sh
```

Livrer **back puis front** ensemble quand une fonctionnalité touche les deux.

Retour arrière d'une migration (si elle a un `down`) :

```bash
npx typeorm migration:revert -d dist/src/data-source.js
```

Certaines migrations refusent volontairement le retour arrière (ex.
référentiels / rôles) : restaurer alors la sauvegarde `predeploy-*.sql.gz`.

---

## 9. Sauvegardes et exploitation

| Élément | Où | Fréquence conseillée |
|---|---|---|
| Base MariaDB | `mysqldump` (cron) ou Plateforme → Sauvegardes | quotidienne |
| Fichiers des cabinets | `uploads/`, `storage/private/` | quotidienne (rsync hors serveur) |
| Sauvegardes chiffrées de l'app | `backups/`, `backups-private/` | copier hors serveur |
| Secrets | `.env` | à conserver dans un coffre (perdre `AI_CONFIG_ENCRYPTION_KEY` / `PAYMENT_CONFIG_ENCRYPTION_KEY` rend illisibles les clés stockées en base) |

Exemple de cron (`crontab -e`) :

```cron
30 2 * * * mysqldump --single-transaction -u kabysoft -p'<mdp>' kabysoft | gzip > /var/backups/kabysoft-$(date +\%F).sql.gz
0 3 * * * find /var/backups -name 'kabysoft-*.sql.gz' -mtime +14 -delete
```

Commandes utiles :

```bash
pm2 status
pm2 logs kabysoft-back
pm2 restart kabysoft-back --update-env    # après modification du .env
pm2 monit
npx typeorm migration:show -d dist/src/data-source.js
npm run diag:login                        # diagnostic d'un mot de passe refusé
```

---

## 10. Dépannage

| Symptôme | Cause probable | Solution |
|---|---|---|
| `migration:run` échoue sur base vide (`Table 'app_settings' doesn't exist`) | Les migrations ne créent pas le schéma de base | Suivre le **Cas B** du § 4 |
| Le conteneur / l'API s'arrête au démarrage avec `Echec des migrations` | Migration en erreur | Lire l'erreur, corriger, relancer `node dist/src/run-migrations.js` |
| `[SECURITE] PLATFORM_JWT_SECRET doit être différent de JWT_SECRET` | Secret plateforme absent ou identique | Générer un secret distinct |
| Pas de code OTP plateforme | SMTP mal configuré | Vérifier `SMTP_HOST` (doit correspondre au certificat), port 465 / `SMTP_SECURE=true` |
| Erreurs CORS dans le navigateur | `CORS_ORIGINS` ne contient pas l'URL exacte du front | Ajouter `https://…` sans `/` final, redémarrer |
| Les réponses de l'IA arrivent d'un bloc ou coupent | Buffering Nginx | `proxy_buffering off` + `proxy_read_timeout 300s` |
| Notifications temps réel absentes | En-têtes `Upgrade` manquants | Vérifier le bloc Socket.IO Nginx |
| `ECONNREFUSED 127.0.0.1:6379` | Redis arrêté | `sudo systemctl start redis-server` |
| Tâches planifiées exécutées deux fois | PM2 en mode cluster ou 2 instances | `instances: 1`, `exec_mode: 'fork'` |
| Sauvegarde en erreur « mysqldump introuvable » | Client MariaDB absent | `apt install mariadb-client` ou `MYSQLDUMP_PATH` |
| `413 Request Entity Too Large` | Limite Nginx | Augmenter `client_max_body_size` |

---

## Annexe — Check-list de mise en production

- [ ] DNS `back.` et domaine du front pointent vers le serveur
- [ ] Serveur 2 vCPU / 4 Go RAM minimum, fuseau `Africa/Douala`
- [ ] MariaDB (`max_allowed_packet=64M`), Redis (127.0.0.1), Nginx, Node 20, PM2 installés ; ufw actif
- [ ] DNS du domaine d'envoi : SPF, DKIM, DMARC
- [ ] `.env` complet, `chmod 600`, `NODE_ENV=production`, `SYNCHRONIZE=false`, `PORT=3005`
- [ ] Tous les secrets générés séparément et copiés dans un coffre
- [ ] `npm run build` OK
- [ ] Base initialisée (Cas A ou Cas B), `migration:show` entièrement coché
- [ ] `npm run seed` (Cas B) et compte Propriétaire créé
- [ ] PM2 : `kabysoft-back` online, `pm2 save` + `pm2 startup`
- [ ] Nginx + certificat HTTPS ; `/api-docs` → 404, `/admin/queues` → 401
- [ ] Front déployé (guide front) ; connexion `/platform/login` avec OTP reçu
- [ ] IA, plans, moyens de paiement, référentiel par défaut publiés
- [ ] Textes juridiques importés dans la base de connaissance
- [ ] Premier cabinet créé via `/onboarding`, SMTP du cabinet testé
- [ ] Sauvegardes automatiques en place et testées (restauration incluse)
