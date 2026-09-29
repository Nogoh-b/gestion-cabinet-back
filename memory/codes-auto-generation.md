---
name: codes-auto-generation
description: Codes/références facultatifs côté front + auto-générés côté back ; numérotation dossier/facture pilotée par les settings cabinet
metadata:
  type: project
---

Décision (juin 2026) : tous les champs `code` / `référence` / `numéro` des ressources sont **facultatifs côté formulaire front** et **auto-générés côté back si non fournis**. La numérotation dossier & facture respecte les réglages du cabinet.

**Settings de numérotation** (table `cabinets`, DTO `AppSettingsDto`) : `invoice_prefix`, `invoice_padding`, `invoice_number_format`, `dossier_prefix`, `dossier_number_format`. Gabarit avec jetons `{PREFIX}{YYYY}{MM}{NNNN}`.

**Numérotation dossier/facture** — DEUX chemins, désormais tous deux settings-aware :
- Service (user-facing) : `FactureService.generateFacNumber` / `DossiersService.generateDossierNumber` (lisaient déjà les settings + honoraient un numéro fourni).
- Write-handlers (chemin IA/LLM) : `facture-write.handler.ts` & `dossier-write.handler.ts` étaient codés en dur (`FAC-/DOS-${year}`) → corrigés pour lire les settings via `this.dataSource.getRepository(Cabinet)` + honorer un numéro fourni. (`dataSource` est `protected` dans `BaseWriteHandler`.)

**Génération de code** : util `src/core/shared/utils/code.util.ts` → `generateEntityCode(prefix, name?, sep='_')` (slug du nom + suffixe aléatoire). Appliqué dans les services `create` : jurisdiction (JUR), invoice-type (FAC), audience-type (AUD), document-category (CAT), plans (PLAN), type-customer (CLI), supplier-invoices invoice_number (FF), action-family (FAM) et action-definition (ACT) via `ActionCatalogService.generateUniqueCatalogCode` (boucle d'unicité + retry sur `ER_DUP_ENTRY`, cf. `src/core/shared/utils/db-error.util.ts`). Déjà auto-générés ailleurs : procedure-type (subscriber `onBeforeCreate`), document-type (`generateUniqueCode`), branch (DTO sans `code`, généré serveur).

**DTO rendus optionnels** (`@IsOptional`, `code?`) : create-jurisdiction, create-audience-type, create-document-category, create-plan, create-invoice-type, create-procedure, create-document-type, create-supplier-invoice (invoice_number), CreateActionFamilyDto, CreateActionDefinitionDto. type-customer déjà optionnel.

⚠️ Aucune `ValidationPipe` globale n'est active (`core.module.ts:193` commentée) : rendre un `code` optionnel dans le DTO ne protège de rien à l'exécution, il faut **aussi** retirer les `dto.code.trim()` du service, sinon `TypeError` dès que le front cesse d'envoyer le champ.

**Front** : `required: false` + placeholder « Auto-généré si laissé vide » + validations assouplies (patterns `*` tolèrent le vide) sur : jurisdiction(.v1), prrocedure(.v1), client-type, document-category, audience-types, facture-types, plan, branch (×2), supplier-invoice, formConfigs (3 codes), dossier (déjà optionnel), facture numero (déjà optionnel).

Exclus volontairement (identifiants externes/métier, pas auto-générables) : `compte.numero` (plan comptable SYSCOHADA), `paiement.numero_cheque` / `reference` (chèque/virement externes), `reference` « Comment nous a-t-il connu ? » (champ marketing, pas un code). [[help-system]]
