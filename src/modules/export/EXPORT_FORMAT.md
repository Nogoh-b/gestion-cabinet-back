# Format de l'export hors-ligne des dossiers (format 1)

Contrat entre `dossier-export.service.ts` (Lot 1, producteur) et la visionneuse
statique `export/viewer/` (Lot 2, consommateur). Les types TypeScript exacts
sont dans [`export-format.ts`](./export-format.ts) : ils font foi.

## Arborescence du ZIP

```
data/index.js                      manifeste (cabinet, date, liste des dossiers)
data/dossier-<id>.js               données d'un dossier, une par dossier exporté
database/dossier-<numero>.sql      INSERT du dossier (réimport MariaDB/MySQL)
Dossier_<numero>/
  dossier.json, resume.txt         métadonnées et résumé texte (historique)
  documents/<nom>                  fichiers des documents
  documents/_fichiers_manquants.txt  documents absents du serveur (si besoin)
  factures/<numero>.pdf            PDF serveur de chaque facture (droit factures)
  factures.csv|json, paiements.csv|json, lignes_factures.csv   (droit factures)
  actions.csv|json                 (droit view_dossier_actions)
  facturation.json, elements_facturables.csv   (droit view_billable_items)
  audiences.csv|json, diligences.csv|json
README.txt                         seulement si aucun dossier n'est accessible
                                   (alors ni data/ ni database/)
```

`<numero>` est le numéro de dossier (ou de facture) assaini : caractères hors
`[A-Za-z0-9_.- ]` remplacés par `_`. Le Lot 2 ne reconstruit jamais un chemin :
il lit les champs `folder`, `data`, `sql`, `documents[].path`, `invoices[].pdf`.

## Chargement en `file://`

`fetch` d'un JSON est interdit en `file://`. Les données sont donc des scripts
à charger par `<script src>`, dans n'importe quel ordre :

```js
// data/index.js
window.__EXPORT__ = window.__EXPORT__ || { dossiers: [] };
window.__EXPORT__.manifest = ({ format_version: 1, generated_at: "...", cabinet: {...}, dossiers: [...] });

// data/dossier-12.js
window.__EXPORT__ = window.__EXPORT__ || { dossiers: [] };
window.__EXPORT__.dossiers.push({ format_version: 1, id: 12, ... });
```

La visionneuse charge `data/index.js`, puis un `<script>` par
`manifest.dossiers[].data`, et lit `window.__EXPORT__.dossiers` (un élément
`ExportDossier` par dossier, à rapprocher du manifeste par `id`).

## `window.__EXPORT__.manifest` (`ExportManifest`)

| Champ | Type | Note |
|---|---|---|
| `format_version` | `1` | |
| `generated_at` | ISO date-heure | date de l'export |
| `cabinet` | `{ id, code, name, address, email, phone, website }` ou `null` | |
| `dossiers[]` | `{ id, dossier_number, object, client, status, opening_date, folder, data, sql }` | ordre de la demande |

## `window.__EXPORT__.dossiers[]` (`ExportDossier`)

| Champ | Contenu |
|---|---|
| `id`, `dossier_number`, `folder`, `sql` | identité et chemins |
| `access` | `{ invoices, billing, actions }` : droits de l'exportateur |
| `dossier` | fiche : objet, statut, issue, phase, dates, juridiction, partie adverse, `client` (`{id, full_name, company_name, email, phone, address, customer_code}`), `lawyer` (`{id, full_name}`), `procedure_type`, `jurisdiction` (`{id, name}`) |
| `stats` | compteurs ; `actions`, `invoices`, `payments` valent `null` sans droit |
| `documents[]` | `{ id, name, status, mimetype, size, created_at, path }` — `path` null si le fichier manque |
| `audiences[]` | date, heure, type/statut (+ `_label`), juridiction, salle, juge, durée, issue, notes, report ; **décision** (`decision`, `decision_text`, `decision_date`, `decision_outcome`, `decision_notes`) ; **rapport** (`report_content`, `report_date`) ; `document_ids`, `decision_document_ids`, `report_document_ids` |
| `diligences[]` | titre, type, statut, échéance, achèvement, `assigned_lawyer`, heures, périmètre, constats, recommandations, `confidential` |
| `steps[]` | étapes du workflow : type/statut (+ `_label`), dates, description, ids des documents / audiences / diligences / factures rattachés |
| `actions[]` ou `null` | titre, définition, statut/priorité (+ `_label`), responsable, dates (`planned_at`, `due_at`, `started_at`, `completed_at`, `cancelled_at`), résultat, décision de facturation (+ `_label`), `documents[] {document_id, role}`, `audiences[] {audience_id, role}`, `relations[] {action_id, role}` |
| `billing` ou `null` | `{ profile, rules[], items[] }` : profil de facturation du dossier, règles, éléments facturables (montants HT/TVA/TTC, statut, `invoice_line_id`) |
| `invoices[]` ou `null` | numéro, type/statut (+ `_label`), dates, devise, HT/TVA/TTC, **`paid` / `remaining`**, `cancelled`, `draft`, `credit`, `pdf`, `lines[]`, **`payments[]`** (`date`, `amount`, `mode_label`, `status_label`, `validated`, `reference`…) |
| `invoice_totals` ou `null` | `{ count, total, paid, remaining, cancelled, drafts, credits }` |

### Règles de calcul (à ne pas refaire côté visionneuse)

`paid`, `remaining` et `invoice_totals` viennent de `facture/invoice-totals.ts` :
seuls les paiements **validés** comptent (`payments[].validated`), une facture
annulée est listée mais sort des totaux, un avoir vient en déduction. La
visionneuse affiche ces nombres tels quels.

### Droits et champs masqués

- Section sans droit : `null` (et `access.<section> = false`). Un tableau vide
  `[]` signifie « droit accordé, aucune donnée ».
- Les champs restreints (`redactRestrictedFields`, ex. taux horaire sans droit
  paie ni facturation) sont **retirés** de l'objet : la visionneuse tolère toute
  clé absente.
- Jamais exportés : mots de passe, jetons, clés client.

## SQL (`database/dossier-<numero>.sql`)

À importer dans une base portant le schéma de l'application (migrations
appliquées) : `mysql nom_base < dossier-XXX.sql`.

- En-tête `SET FOREIGN_KEY_CHECKS=0`, `SQL_MODE='NO_AUTO_VALUE_ON_ZERO'`,
  transaction ; valeurs restaurées en fin de script.
- Référentiels (juridictions, types de procédure, client, avocat et son compte
  `user`) en `INSERT IGNORE` ; le reste en `INSERT` : `dossiers`, `step`,
  `document_customer` (+ versions, notes), `audiences`, `diligences`, factures,
  lignes et paiements, profil / règles / éléments facturables, actions et
  leurs liens, tables de jointure (documents d'audience, d'étape…).
- Toutes les lignes ont `tenant_id` = cabinet du dossier (juridictions et types
  de procédure : aussi les données globales `tenant_id = 1`).
- Mêmes droits que le ZIP ; colonnes restreintes à `NULL` ; secrets (mot de
  passe, jetons, clés client, données personnelles de l'avocat) à `NULL`.
- Colonnes générées (ex. `billable_items.professional_action_key`) omises.
