# Documentation des modules pour l'assistant IA

Chaque fichier `.md` de ce dossier documente un module ou une ressource de KabySoft.
Quand l'utilisateur demande au chat « comment ça fonctionne », « comment créer… »,
« à quoi sert… », l'assistant retrouve les documents pertinents (voir
`../help-knowledge.ts`), y répond d'après leur contenu et ne se fie pas à sa mémoire.

## Ajouter ou mettre à jour un module

1. Créer (ou modifier) un fichier `<module>.md` ici. Aucun code à changer.
2. Commencer par l'en-tête :

   ```
   ---
   id: identifiant-court
   title: Titre affiché
   keywords: mot, expression exacte, autre expression
   paths: /route-front, /autre-route
   ---
   ```

   - `keywords` : les mots et expressions que l'utilisateur emploie (sans accents,
     en minuscules, séparés par des virgules). Une **expression de plusieurs mots**
     pèse 3, un **mot seul** pèse 1 — privilégiez des expressions précises
     (« note de frais », « bulletin de paie ») ; évitez les mots trop généraux.
   - `paths` : préfixes de routes front. Si l'utilisateur est sur cette page et
     demande « comment créer ? » sans nommer de sujet, ce document est utilisé.
3. Plan recommandé du corps : À quoi ça sert · Où le trouver · Prérequis ·
   Créer pas à pas (libellés exacts des menus et boutons) · Champs obligatoires ·
   Règles et statuts · Automatismes · Erreurs fréquentes · Créer depuis le chat.
4. Vérifier chaque libellé dans le front (`gestion-cabinet-front`) et chaque règle
   dans le code : ne jamais documenter de mémoire.
5. Reconstruire le back (`yarn build`) : `nest-cli.json` copie les `.md` dans
   `dist/src/core/ai-database/help-docs`.

## Modules documentés

| Fichier | Sujet |
|---|---|
| `modules.md` | Vue d'ensemble : tous les modules, menus, permissions et plans |
| `tableau-bord.md` | Tableau de bord : raccourcis, indicateurs, À surveiller |
| `dossier.md` | Dossiers : ouverture, actions, clôture |
| `facturation-configuration.md` | Configuration de la facturation (cabinet, types de facture, catalogue d'actions, convention du dossier) |
| `elements-facturables.md` | Éléments facturables (réserve « À facturer ») |
| `factures.md` | Factures et paiements |
| `paie.md` | Paie : périodes, bulletins, barème, avances |
| `employes.md` | Employés / collaborateurs |
| `comptabilite.md` | Comptabilité : écritures, plan, exercices, rapports |
| `depenses.md` | Dépenses : factures fournisseur, notes de frais, frais et débours |
| `clients.md` | Clients et types de clients (groupes), accès à l'espace client |
| `audiences.md` | Audiences, agenda, report, rapport, décision, types d'audience |
| `documents.md` | Documents, types (natures) et catégories de documents |
| `diligences.md` | Diligences et findings |
| `procedures.md` | Types de procédure, modèles de procédure (templates) et procédures en cours |
| `juridictions.md` | Juridictions (tribunaux, cours) |
| `apporteurs.md` | Apporteurs d'affaires, apports de dossiers, commissions |
| `agences.md` | Agences (bureaux) du cabinet |
| `roles-permissions.md` | Rôles et permissions |
| `modeles-documents.md` | Modèles de mails, modèles PDF, en-têtes et pieds de page |
| `abonnement.md` | Abonnement, plan, quotas, paiement |
| `recherche.md` | Recherche globale et palette de commandes |
| `statistiques.md` | Statistiques et rapports avancés |
| `messages-notifications.md` | Messages (e-mails), notifications (cloche) et chat interne |
| `profil-preferences.md` | Profil, Mes demandes, sécurité du compte et préférences |
| `cabinet-parametres.md` | Paramètres du cabinet (identité, devise, TVA, numérotation) |
| `parcours-dossier.md` | Parcours dossier : catalogue d'actions et recommandations |
| `espace-client.md` | Espace client (portail) : accès, dossiers, factures, messages |
| `administration.md` | Administration : sécurité, SMTP, sauvegarde, audit, IA |
| `import-export.md` | Exports, impressions et PDF (pas d'import en masse) |
| `aide.md` | Centre d'aide, aide contextuelle, raccourcis clavier, support |
| `assistant-ia.md` | Assistant IA : modes, mentions, confirmation, pré-remplissage |
| `modes-chat.md` | Modes du chat (« / »), niveaux de réflexion, mode / compétence / mention |
| `competences.md` | Compétences du chat (« # ») : principe, familles, cartes, droits |
| `competences-communication.md` | Compétences Communication : e-mail, WhatsApp, espace client, messagerie, factures |
| `competences-documents.md` | Compétences Documents : courrier, mise en demeure, modèles, traduction, bilingue, anonymisation |
| `competences-analyse.md` | Compétences Analyse juridique : jugement, conclusions, chronologie, contrat, mentions, chances, comparables, plaidoirie |
| `competences-actes.md` | Compétences Calculs & actes : délais, décompte de créance, injonction de payer, convention d'honoraires |
| `competences-rapports-agenda.md` | Compétences Rapports & exports et Agenda & tâches |

## Reste à documenter

Tous les modules sont couverts — rien en attente.
