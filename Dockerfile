# Dockerfile — Backend NestJS KabySoft (multi-stage)
# Image finale minimaliste, sans devDependencies ni source non compilée.

# ── Étape 1 : build ──────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# Outils natifs requis par certaines dépendances (bcrypt, sharp, sqlite3).
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

# Copie d'abord les manifests de dépendances pour exploiter le cache Docker.
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# Copie du reste des sources et compilation.
COPY . .
RUN yarn build

# ── Étape 2 : production ─────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS production
WORKDIR /app

ENV NODE_ENV=production

# Ne garder QUE les dépendances de production.
COPY package.json yarn.lock ./
RUN yarn install --production --frozen-lockfile && \
    yarn cache clean

# Artefacts compilés depuis l'étape builder.
COPY --from=builder /app/dist ./dist

# Volume des uploads (monté par le compose / l'orchestrateur en prod).
RUN mkdir -p uploads
VOLUME ["/app/uploads"]

# Healthcheck basique : le serveur répond sur / (à adapter si route dédiée).
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3004/api-docs',r=>process.exit(r.statusCode<500?0:1)).on('error',()=>process.exit(1))"

EXPOSE 3004
# Les secrets sont fournis via les variables d'environnement (jamais dans l'image).
CMD ["node", "dist/src/main.js"]
