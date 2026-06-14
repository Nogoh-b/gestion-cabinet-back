---
name: help-system
description: Système d'aide contextuelle du frontend — registre + HelpButton, comment étendre aux autres modules
metadata:
  type: project
---

Système d'aide contextuelle ajouté au frontend (gestion-cabinet-front), juin 2026.

**Architecture :**
- Registre typé : `app/configs/help/help.types.ts` (type `HelpResource`) + `app/configs/help/registry.ts` (`getHelp(key)`, `getAllHelp()`).
- Contenu : `app/configs/help/content/comptabilite.help.ts` et `modules.help.ts`.
- UI : `app/components/aide/HelpButton.tsx` — bouton « ? Aide » ouvrant un panneau latéral (`Sheet`). Sections : Résumé, **« À faire avant » (prérequis, encadré ambre)**, Comment procéder (étapes), Champs du formulaire (obligatoire/facultatif), Astuces, FAQ, Raccourcis, Pages liées. Dégradation silencieuse si la `helpKey` n'existe pas.
- `HelpResource.prerequisites` (type `HelpPrerequisite[]` : `label`, `hint`, `href`) = dépendances métier à mettre en place avant (ex: écriture → exercice ouvert + comptes ; fiche de paie → période + collaborateur ; facture fournisseur → fournisseur ; membre → rôle + agence). Présent sur 30/34 ressources.
- `HelpResource.tabs` (type `HelpTab[]`) et `HelpResource.actions` (type `HelpAction[]` : `label`, `description`) = documentation des onglets et des boutons de la fiche détail. Sections « Onglets de la fiche » et « Actions de la fiche » affichées UNIQUEMENT en contexte détail. `HelpButton` a une prop `context?: "list" | "detail"` : GenericDetailPage passe "detail", DashboardTable passe "list" (masque onglets+actions pour garder l'aide liste concise). Onglets : 14 ressources ; actions : 11 ressources. Renseignés d'après les vrais `*.tabs.tsx` / `*.actions.tsx` de `app/configs/detailPage/`. NB : supplier, expense-report, payroll-period, referral-commission ont `tabs: () => []` (pas d'onglets) → volontairement non documentés.

**Branchements génériques :** `GenericDetailPage` et `DashboardTable` (→ `PageHeader`) acceptent une prop `helpKey`. Compta utilise des tables custom → `<HelpButton>` posé manuellement.

**Couvert (34 ressources) :** comptabilite (ecritures, comptes, exercices, rapports) ; dossiers, clients, factures, audiences ; documents, diligences, procedures ; suppliers, supplier-invoices, expense-reports ; payslips, payroll-periods, referrers, dossier-referrals ; membres, agences, jurisdictions, plans, document-categories, document-types, facture-types ; settings-app, settings-profile, settings-roles, settings-user, mails, mail-templates, pdf-templates, abonnement, recherche. Contenu dans `content/{comptabilite,modules,documents,suppliers,payroll,admin,settings}.help.ts`.

Pages config = pages custom (pas de générique) : `<HelpButton variant="icon">` posé à la main dans l'en-tête (settings/*, mails, mail-templates, pdf-templates, abonnement). recherche utilise PageHeader → prop `help`.

**Pour ajouter un module :** créer un `HelpResource` dans `content/`, l'ajouter à `ALL_HELP` dans registry.ts, puis passer `helpKey="..."` à `<DashboardTable>` (liste) / `<GenericDetailPage>` (détail). Champs obligatoires dérivés des configs `app/configs/form/*.form.v1.ts`.

**Page globale `/aide` :** reconnectée au registre via `app/components/aide/registry-adapter.tsx` (`categoriesFromRegistry`, `faqsFromRegistry`, `guidesFromRegistry`, `quickLinksFromRegistry`). Plus de données fictives ; `data.tsx` ne garde que `KEYBOARD_SHORTCUTS`. Les cartes de catégorie et liens naviguent vers la page du module (map META key→href/icône/couleur dans l'adaptateur).

**Reste à faire :** compléter les ~25 autres modules (ajouter `HelpResource` + `helpKey`, et une entrée META dans registry-adapter pour l'icône/lien sur /aide).
