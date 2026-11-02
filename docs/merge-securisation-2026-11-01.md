# Merge `feature/securisation-juridique-refonte` → `dev` (branche `merge/securisation`)

Date : 2026-11-01. Merge de `origin/feature/securisation-juridique-refonte`
(`ad624556`, 25 commits partis de `main`) dans `dev` qui contient désormais
`feat/export-audiences-badges` (`10662200`).

## Résultat

- 38 fichiers en conflit résolus, dont 96 hunks de contenu et 10 conflits
  *modify/delete*.
- `npm run build` : OK. `tsc -p tsconfig.build.json --noEmit` : 0 erreur.
- Branche : `merge/securisation` (non poussée).

## Règle d'arbitrage appliquée

| Zone | Choix | Raison |
|---|---|---|
| Câblage (`main.ts`, `core.module.ts`, `app.module.ts`) | union des deux | les deux côtés ajoutent des guards/filters/modules sans se contredire |
| Modèle dossier / procédure / étapes | **secu** | c'est l'objet de la refonte ; les migrations `1785169xxx` suppriment l'ancien état. Conserver les deux modèles est impossible |
| Features export / audiences / sidebar / documents | **dev+export** | prioritaires, testées et attendues par le front |
| Comptabilité (`facture-stats`) | **secu** + correctif ENUM de dev (`enumValue()`) | secu apporte crédits d'avoir et revenu reconnu net ; dev corrigeait la comparaison d'ENUM, ré-appliqué |
| `document-customer` (controller/service) | **dev** | API consommée par le front (notes, stats, éditeur, versions) |
| `dossier-export.service` | **dev** | version fonctionnelle complète (store, SQL, visionneuse, quota) |
| Sauvegardes | **secu** (service chiffré) + 3 méthodes ajoutées (`prepareDownload`, `restore`, `remove`) | le contrôleur plateforme appelait une API qui n'existait plus |

## Gaps connus (à arbitrer, non silencieux)

1. **Écriture IA** : 18 handlers d'écriture d'entité restent supprimés (26 sur
   `dev`, 8 ici) et `AutoHandlerFactory` n'est plus enregistré. L'assistant ne
   peut plus écrire dans dossiers, factures, paiements, paie, fournisseurs,
   procédures, comptabilité. À re-porter ou à acter comme abandon.
2. **Étapes (step)** : entités `step` / `step_action` et `step.service` retirés
   par secu. L'export ZIP/SQL n'a donc plus de section « étapes » (code
   neutralisé) et le lien document↔étape a été retiré de `DocumentCustomer`.
3. **Analyse IA du dossier** : `dossier-analysis.service` et les endpoints
   `POST /dossiers/:id/analysis/{preliminary,client-decision,judgment}` ne sont
   plus exposés.
4. **Versions de documents** : deux systèmes cohabitent (`document_customer_version`
   côté dev, `document_versions` + `current_version_id` côté secu). Compilent et
   fonctionnent séparément ; à unifier.
5. **Endpoints de validation de version** (secu : `validate`, `scan`, `reject`,
   `revoke`) non exposés : le service `DocumentVersionService` les porte, le
   contrôleur retenu est celui de dev.
6. **Statut de facture « impayée »** : `StatutFacture.IMPAYEE` (valeur 4) a
   disparu du modèle ; la watchlist du tableau de bord n'a plus cette teinte.
7. **Paquet manager** : le dépôt reste sur **yarn** (`packageManager` +
   `yarn.lock` conservés) alors que secu passait à npm ; les scripts ajoutés par
   secu (`typecheck`, `migration:rehearse`, `backup:*`, `openapi:*`…) sont
   conservés.
8. **Migrations** : 3 migrations déjà appliquées ont été modifiées par secu
   (cosmétique + logique `logo`) et 52 nouvelles migrations ont des timestamps
   antérieurs à l'existant. Rejouer `migration:rehearse` avant toute prod.

## Contrôles effectués

- `npm run build` OK
- `tsc --noEmit` OK (0 erreur)
- `npm run migration:rehearse` : refusé par le garde-fou (cible non anonymisée) —
  il faut une base dédiée (`DB_NAME` contenant `rehearsal`/`reco`/`test`, etc.) et
  `MIGRATION_REHEARSAL_CONFIRMATION=ANONYMIZED_COPY_ONLY`.

### Tests (baseline mesurée)

| Run | Suites OK | Suites KO | Tests KO |
|---|---|---|---|
| `dev` seul (`10662200`) | 204 / 247 | 42 | 49 |
| merge, avant adaptations | 204 / 277 | 71 | 109 |
| merge, après adaptations (3 suites réparées) | 207 / 277 | ~68 | ~88 |

`dev` n'était donc pas vert avant le merge (42 suites déjà rouges : specs Nest
génériques et dépendances de constructeurs).

Suites réparées dans ce commit : `modules/export/dossier-export.service.spec.ts`
(21/21), `modules/export/dossier-sql.exporter.spec.ts`, `app.controller.spec.ts`.
`modules/audiences/audience-workflow.spec.ts` : 11 → 6 tests rouges (en cours).

### Causes des suites encore rouges (par volume)

1. **Contexte tenant strict** — `getCurrentTenantId()` lève désormais
   `Aucun contexte cabinet actif` (secu). Les specs qui appellent un service
   tenant-scopé hors ALS échouent : correctif = envelopper l'appel dans
   `runWithTenantContext(1, () => …)` (cf. `dossier-export.service.spec.ts`).
2. **Signature des constructeurs** — secu a ajouté des paramètres
   (`ReminderScheduler` 7→8, `AiDatabaseController` 4→7,
   `ProcedureInstanceController` +`LegacyWorkflowMutationGuard`, etc.) : les
   `new X(...)` des specs doivent être complétés.
3. **Modules supprimés** — `AppService`, `Step`/`StepAction`, `step.service`,
   `dossier-analysis.service`, `*`-write.handler, `backup.controller` : les specs
   qui les importent ne compilent plus.
4. **Changements de comportement** — statuts de facture (`IMPAYEE` retiré),
   comparaison des ENUM, `DossierStatus` devenu chaîne, `AudienceStatus` +
   `IN_PROGRESS`.

Point d'entrée le plus rentable : traiter (1) puis (2), qui couvrent la majorité
des 68 suites restantes.

