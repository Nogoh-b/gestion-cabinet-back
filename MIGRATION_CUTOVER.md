# Bascule V3 — procédure pilotée exclusivement par template

Ce runbook est une porte de mise en production. Il ne remplace ni la validation
juridique/comptable, ni l’accord explicite du responsable de bascule.

## 1. Préconditions bloquantes

- Geler les écritures métier pendant la sauvegarde et la migration finale.
- Identifier un cabinet pilote et les responsables juridique, comptable et
  technique qui signeront la recette.
- Définir une fenêtre de retour arrière et un propriétaire d’incident.
- Préparer une clé `BACKUP_ENCRYPTION_KEY` dédiée et conservée hors du dépôt.
- Vérifier que `synchronize` et `migrationsRun` restent désactivés.
- Ne jamais exécuter les commandes ci-dessous directement sur la production
  avant leur succès sur une copie anonymisée récente.

## 2. Sauvegarde et restauration probatoire

Créer une sauvegarde chiffrée :

```powershell
npm run backup:create
```

Vérifier son enveloppe et son empreinte :

```powershell
npm run backup:verify -- <sauvegarde.sql.enc>
```

Restaurer cette sauvegarde dans une base de maintenance isolée :

```powershell
$env:MAINTENANCE_MODE='true'
npm run backup:restore -- <sauvegarde.sql.enc>
```

Consigner l’identifiant de sauvegarde, l’empreinte, l’heure UTC, l’opérateur,
la durée et le résultat de restauration. Une sauvegarde non restaurée en test
ne constitue pas une preuve de reprise.

## 3. Répétition sur copie anonymisée

Configurer `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` et `DB_NAME` vers la
copie anonymisée. Le nom de la base doit signaler explicitement qu’il s’agit
d’une cible `anon`, `rehearsal`, `recette`, `preprod`, `staging`, `test` ou
`qa`.

Effectuer d’abord le préflight strictement en lecture seule :

```powershell
$env:MIGRATION_REHEARSAL_CONFIRMATION='ANONYMIZED_COPY_ONLY'
npm run migration:rehearse
```

Le préflight refuse notamment :

- `NODE_ENV=production` ;
- un nom de base ambigu ou contenant `prod`, `production` ou `live` ;
- une cible distante sans `MIGRATION_REHEARSAL_ALLOW_REMOTE=true` ;
- une base vide ;
- un historique de migrations non rapproché.

Après vérification du rapport privé créé sous
`artifacts-private/migration-rehearsal`, autoriser explicitement les écritures :

```powershell
npm run migration:rehearse -- --execute
```

Cette commande enchaîne :

```powershell
npm run migration:run
npm run migration:verify
npm run migration:verify-data
```

Les rapports JSON et Markdown ne contiennent ni mot de passe ni données
métier et restent exclus de Git.

La dernière commande doit rester en échec tant qu’une anomalie bloquante est
présente. Elle contrôle notamment :

- le rapprochement de tous les anciens statuts de dossier ;
- l’absence de phase procédurale dans `dossiers` ;
- les liens dossier/instance dans le même cabinet ;
- la version exacte, le snapshot et l’empreinte de chaque instance ;
- une seule visite active, cohérente avec l’étape courante ;
- les versions documentaires privées et leurs SHA-256 ;
- les pièces fournisseurs, commissions et pièces de chat à reprendre.

## 4. Traitement des anomalies

Les tables suivantes constituent la liste de travail de reprise :

- `dossier_lifecycle_migration_audit` ;
- `procedure_repair_issues` ;
- `document_migration_issues` ;
- `supplier_evidence_migration_issues` ;
- `referral_commission_migration_issues` ;
- `chat_attachment_migration_report`.

Une résolution doit toujours indiquer l’opérateur, la date UTC et un motif.
`ACCEPTED_RISK` est réservé à une dérogation formellement approuvée. Une
anomalie ne doit jamais être effacée pour rendre le contrôle vert.

Pour un ancien dossier clos ou archivé sans instance terminée, la dérogation
doit être enregistrée dans `dossier_lifecycle_migration_audit` avec
`review_status = 'VALIDATED'`, `reviewed_by_id`, `reviewed_at` et une
`review_note` non vide.

Après chaque vague de correction, rejouer :

```powershell
npm run migration:verify-data
```

## 5. Recette du cabinet pilote

La recette doit couvrir au minimum :

1. création d’un brouillon sans instance ;
2. activation atomique avec version publiée du template ;
3. transition bloquée par une exigence manquante ;
4. ajout puis validation d’une version documentaire ;
5. audience, report et rappel durable ;
6. facture, paiement partiel puis paiement final ;
7. écriture comptable, contrepassation et clôture d’exercice ;
8. clôture du dossier uniquement après fin de l’instance ;
9. export ZIP privé et vérification du manifeste ;
10. tentative d’accès depuis un autre cabinet et un non-membre.

Le rapport de recette doit référencer les identifiants d’audit et d’outbox.

## 6. Bascule progressive

- Déployer d’abord sur l’environnement pilote.
- Comparer pendant la recette la synthèse dossier en lecture seule avec
  l’instance et son snapshot ; aucun statut procédural du dossier ne doit être
  consulté ou écrit.
- N’ouvrir un nouveau cabinet qu’après succès de
  `migration:verify-data` sur sa copie et signature de sa recette.
- Ne pas réintroduire une double écriture dans `dossiers`. La comparaison
  temporaire s’effectue avec les tables d’audit historiques, en lecture seule.
- Suspendre immédiatement la vague si le taux d’erreur, les événements outbox
  en échec ou les anomalies de rapprochement augmentent.

## 7. Surveillance pendant 14 jours

Contrôler quotidiennement :

- événements outbox en échec et nombre de tentatives ;
- ruptures de chaîne dans `audit_events` ;
- instances actives sans visite active ;
- dossiers actifs sans instance ;
- rappels non livrés et file d’échec ;
- écarts paiements/factures ;
- écritures non équilibrées ou tentées dans un exercice clos ;
- téléchargements/exportations refusés ou anormaux ;
- nouvelles lignes dans les tables de reprise.

À J+14, exécuter une dernière fois les deux certificateurs, archiver le rapport
signé et seulement alors autoriser le retrait différé des compatibilités
restantes.
