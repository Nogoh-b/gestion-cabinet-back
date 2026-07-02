# Politique de sécurité — KabySoft (cabinets juridiques)

Ce document décrit la politique de sécurité, la gestion des secrets et les
engagements de conformité de la solution KabySoft. La plateforme traitant des
données couvertes par le **secret professionnel** des avocats (pièces de
dossiers, correspondances, données personnelles des clients), la sécurité est
une exigence déontologique et légale, pas seulement technique.

## Signaler une vulnérabilité

Merci de **ne pas** ouvrir de ticket public pour une faille de sécurité.

- Contactez-nous en privé à : `contact@nouyadjamassociates.com` (objet : `[SEC]`).
- Fournissez : description, étapes de reproduction, impact estimé.
- Nous accusons réception sous **72 h** et tenons l'auteur informé de l'avancement.
- Une divulgation coordonnée est organisée après correction.

## Gestion des secrets

**Principes :**
- Aucun secret n'est codé en dur dans le code source (identifiants SMTP, clés
  API, mots de passe DB, JWT secret).
- Les secrets sont fournis via des variables d'environnement, jamais commités
  (`.env` est ignoré par `.gitignore`).
- En production, utiliser un coffre-fort de secrets (HashiCorp Vault, AWS
  Secrets Manager, Doppler...) plutôt que des fichiers `.env`.

**Rotation des secrets** (à planifier) :
| Secret | Fréquence | En cas d'incident |
|---|---|---|
| `JWT_SECRET` | Trimestriel | Immédiate (invalide toutes les sessions) |
| Clés API IA (DeepSeek, GLM, Gemini, XAI) | Semestriel | Immédiate si fuite suspectée |
| Identifiants SMTP | Annuel | Immédiate si compromission |
| Mots de passe DB | Annuel | Immédiate si accès suspect |
| Clés paiement (Mendo Coti) | Selon prestataire | Immédiate si fuite |

Le fichier `.env.example` documente toutes les variables attendues.

## Authentification

- Mots de passe hachés via **bcrypt** (cost ≥ 10).
- Authentification JWT avec secret fort (≥ 24 caractères, vérifié au démarrage).
- **Rate limiting** actif sur les routes sensibles (login, OTP, reset-password)
  pour prévenir le brute-force.
- Double authentification (MFA par OTP e-mail) disponible par utilisateur.
- En production, envisager l'expiration courte des access tokens + refresh
  token avec blacklist serveur.

## Isolation multi-tenant (confidentialité inter-cabinets)

Chaque cabinet a des données strictement isolées. Le contrôle cross-tenant est
**fail-closed** : un jeton d'un cabinet A ne peut jamais accéder aux données du
cabinet B, même en l'absence d'en-tête de résolution de tenant.

Voir `scripts/audit-tenant-queries.ts` pour l'audit statique des requêtes
TypeORM non protégées par le filtre `tenant_id` (à traiter au fil de l'eau).

## Fichiers & confidentialité

- Les uploads sont validés (whitelist d'extensions et types MIME).
- Les pièces sont servies en `Content-Disposition: attachment` + `nosniff` pour
  empêcher XSS/sniffing.
- **À mettre en place** (recommandation forte) : chiffrement au repos des pièces
  de dossiers (AES-256 via KMS).

## Conformité RGPD & déontologie

| Exigence | Statut | Action |
|---|---|---|
| Journal d'audit d'accès aux dossiers | ⏳ À faire | Tracer qui consulte quel dossier, quand |
| Droit d'accès / rectification / effacement | ⏳ À faire | Module d'export et suppression des données personnelles |
| Registre des traitements | ⏳ À faire | Documenter les traitements de données |
| Sous-traitants IA (LangChain, OpenAI...) | ⏳ À vérifier | Contrôler que les données clients ne sont pas envoyées à des LLM externes sans accord |
| Chiffrement en transit | ✅ HSTS/TLS via Helmet | — |
| Chiffrement au repos | ⏳ À faire | Voir section Fichiers |

**Attention particulière — IA juridique :** les données de dossiers envoyées
aux providers d'IA (DeepSeek, GLM, Gemini, XAI) transitent vers des serveurs
tiers. Vérifier que le contrat avec chaque provider garantit la
confidentialité et l'absence de rétention/entraînement sur ces données, et en
informer les cabinets clients (obligation de transparence).

## Logs

- Logs structurés via **Winston** avec rotation.
- Les `console.log` de code métier contenant des données sensibles (ex. permissions)
  ont été remplacés par `this.logger.debug()`.
- Ne jamais logger : mots de passe, tokens, données personnelles en clair.
