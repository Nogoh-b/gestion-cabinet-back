---
id: modules
title: Modules du cabinet (vue d'ensemble)
keywords: module, modules, liste des modules, quels sont les modules, modules du cabinet, modules de mon cabinet, fonctionnalites, fonctionnalites de l'application, que fait l'application, que peut faire l'application, menus, menus de l'application, rubriques, rubriques du menu, navigation, ou trouver un module, barre laterale, sidebar, menu plus, panneau plus, menu du compte, organisation de l'application, plan de l'application, que contient kabisoft, presentation de l'application
paths: /dashboard, /aide
---

# Modules du cabinet (vue d'ensemble)

## À quoi ça sert
KabySoft est organisé en **modules**, chacun accessible par un **menu** de la barre latérale, du panneau **Plus** ou du **menu du compte** (avatar en haut à droite). Les menus que vous voyez dépendent de votre **rôle** (permissions) et des **modules inclus dans votre plan d'abonnement** : un menu absent signifie en général un droit manquant ou un module non souscrit, pas un bug.

## Où trouver les modules
- **Barre latérale** (à gauche) : Tableau de bord, puis sections **Dossiers**, **Relation client**, **Cabinet**, **Pilotage**.
- **Panneau Plus** (bouton **Plus** en bas de la barre latérale) : groupes **Pilotage**, **Communication**, **Cabinet**, **Finances**, **Configuration**.
- **Menu du compte** (avatar) : Mon profil, Préférences, Administration, Cabinet, Parcours dossier, Abonnement, Aide.
- **Espace client** (portail séparé `/espace-client`, pour vos clients) : Dossiers, Factures, Messages, Profil.
- **Barre du haut** : recherche globale, palette **Ctrl + K**, notifications (cloche), assistant IA (chat).

## Les modules, un par un

### Tableau de bord
- Menu **Tableau de bord** (`/dashboard`, permission « voir le tableau de bord »).
- Page d'accueil : raccourcis (Ouverture, Gestion, Facturation), indicateurs clés, bandeau **À surveiller** (dossiers urgents, diligences en retard, factures impayées, documents en attente, audiences à venir), actions de l'avocat, onglets Vue d'ensemble / Finances / Activité / Équipe. Voir « Tableau de bord ».

### Dossiers
- **Ouverture de dossier** (`/dossiers/ouverture`, permission « créer un dossier ») : crée l'affaire (client, objet, juridiction, facturation initiale).
- **Gestion de dossier** (`/dossiers`, permission « voir les dossiers ») : liste, filtres et fiche du dossier (actions, audiences, documents, diligences, facturation, apporteur, communication, chat). Parcours orienté actions en 3 phases : Ouverture → Traitement → Clôture. Voir « Dossiers ».
- **Référentiels dossiers** (Plus > Configuration, administrateur et secrétaire) : **Juridictions** (`/dossiers/juridiction`), **Diligences** (`/dossiers/diligences`), **Types de procédure** (`/dossiers/procedure`). Voir « Juridictions », « Diligences », « Procédures ».
- **Parcours dossier** (menu du compte, administrateur, `/settings/case-workflow`) : catalogue d'actions (familles, sous-actions, traitement financier par défaut), règles de recommandation, réglage « Nouveaux dossiers en V2 ». Voir « Parcours dossier ».

### Audiences et agenda
- **Agenda** (`/audiences/calendrier`, permission « voir l'agenda ») : calendrier mensuel.
- **Audiences** (Plus > Pilotage, `/audiences`, permission « voir les audiences ») : liste, **Nouvelle audience**, fiche (Aperçu, Communication, Rapport, Décision, Documents, Historique). Cycle : Planifiée → Tenue / Reportée / Annulée ; rappel automatique 48 h avant. Voir « Audiences et agenda ».

### Clients
- **Clients** (`/clients`, permission « voir les clients ») : liste, **Nouveau client**, fiche (Aperçu, Dossiers, Factures, Documents, Communication, Journal). Voir « Clients ».
- **Groupes de clients** (Plus > Cabinet, `/clients/groupes`) : types de clients (Particulier, Entreprise…). Voir « Clients ».

### Documents
- **Documents** (`/documents`, permission « voir les documents », module Documents du plan) : pièces rattachées aux dossiers, classées par catégorie et nature. **Nouveau document**. Voir « Documents ».
- **Référentiels documents** (Plus > Configuration, `/documents/type`) : types de documents ; raccourci **Catégories** (`/categories`). Voir « Documents ».

### Facturation
- **Gestion de facture** (`/facturation`, permission « voir les éléments facturables », module Facturation du plan) et **Facturation des dossiers** (Plus > Finances, `/facturation/elements-facturables`) : réserve « À facturer », raccourci **Factures** (`/facturation/factures`). Voir « Éléments facturables », « Factures et paiements ».
- **Types de facture** (Plus > Configuration, `/facturation/factures/type`) : TVA et délai par type. Voir « Configuration de la facturation ».
- La convention d'honoraires du dossier se règle dans Dossier > Facturation > **Paramètres de facturation**. Voir « Configuration de la facturation ».

### Comptabilité
- **Comptabilité** (Plus > Finances, `/comptabilite`, permission « voir la comptabilité ») : **Écritures**, **Plan comptable**, **Exercices**, **Balance**, **Compte de résultat**, **État TVA**, **Synchronisation**. Plan SYSCOHADA, écritures générées automatiquement à l'émission et au paiement. Voir « Comptabilité ».

### Dépenses (fournisseurs, notes de frais)
- **Gestion des dépenses** (`/expenses`, permission « voir les dépenses », module Dépenses du plan) et **Dépenses** (Plus > Finances) : liste unique, **Nouvelle dépense**, raccourcis **Fournisseurs** (`/suppliers`), **Factures fournisseurs** (`/supplier-invoices`), **Notes de frais** (`/expense-reports`). Refacturation au dossier après approbation. Voir « Dépenses ».

### Apporteurs d'affaires
- **Apporteurs** (Plus > Finances, `/referrers`, permission « voir les apporteurs ») : **Nouvel apporteur**, raccourcis **Apports de dossiers** (`/dossier-referrals`, **Assigner un apporteur**) et **Commissions** (`/referral-commissions`, **Calculer une commission**). Cycle commission : Calculée → Approuvée → Payée. Voir « Apporteurs d'affaires et commissions ».

### Employés et paie
- **Gestion des employés** (`/gestion-cabinet/employees`, permission « voir les utilisateurs ») : **Nouvel employé**, fiche (Aperçu, Dossiers, Présence, Tarifs, Communication, Avances sur salaire, Audit). Le profil d'accès y est choisi. Voir « Employés ».
- **Agences** (`/gestion-cabinet/cabinet`, administrateur) : bureaux de rattachement. Voir « Agences ».
- **Gestion des paies** (`/paie`, permission « voir la paie », module Paie du plan) : cycle mensuel — période → **Générer les bulletins** → contrôle → **Clôturer la période** → **Marquer payée** ; **Paramètres de paie** (barème), onglet **Avances sur salaire**. Voir « Paie ».

### Communication (messages, notifications, chat)
- **Messages** (Plus > Communication, `/mails`, permission « voir les messages ») : e-mails du cabinet — **Nouveau message**, onglets Tous / En attente / Envoyés / Échecs / Annulés. Voir « Messages et notifications ».
- **Notifications** (cloche en haut) : rappels d'audience, diligences, décisions sur demandes, factures. Voir « Messages et notifications ».
- **Chat interne** (`/chat`) et onglet Chat de chaque dossier : conversations d'équipe. Voir « Messages et notifications ».

### Statistiques et recherche
- **Statistiques** (`/rapports`, permission « voir les rapports », module Rapports avancés du plan) : activité sur période, comparaison, export PDF / Excel. Voir « Statistiques et rapports avancés ».
- **Recherche globale** (barre du haut, page `/recherche`, palette **Ctrl + K**) : dossiers, clients, documents, audiences, factures. Voir « Recherche globale ».

### Modèles (mails, PDF)
- **Modèles** (Plus > Configuration, administrateur, `/mail-templates`) : textes des e-mails ; raccourcis **Modèles PDF** (`/pdf-templates`) et **En-têtes et pieds de page** (`/template-blocks`). Voir « Modèles de mails, de PDF et en-têtes / pieds de page ».

### Paramètres du compte et du cabinet
- **Mon profil** (`/settings/profile`, ou `/profil` en self-service pour les non-admins) : identité, **Mes demandes** (avances, permissions), Sécurité (double authentification). Voir « Profil et préférences ».
- **Préférences** (`/settings/user`) : langue, thème, apparence. Voir « Profil et préférences ».
- **Cabinet** (menu du compte, administrateur, `/settings/app`) : identité du cabinet, logo, devise, TVA par défaut, numérotation des factures et dossiers, frais d'ouverture. Voir « Paramètres du cabinet ».
- **Rôles & Permissions** (Paramètres, administrateur, `/settings/roles`) : droits par rôle. Voir « Rôles et permissions ».
- **Administration** (menu du compte, administrateur, `/admin`) : Utilisateurs, Rôles & permissions, Authentification (double authentification), SMTP, Sauvegarde, Audit, IA. Voir « Administration ».
- **Abonnement** (menu du compte, administrateur, `/abonnement`) : plan, quotas, modules inclus, **Changer de plan**. Voir « Abonnement et plan ».
- **Aide** (`/aide`) : centre d'aide (FAQ, guides, contact).

### Espace client (portail)
- Portail séparé (`/espace-client`, rôle Client) : accueil (dossiers actifs, reste à payer, documents en attente, messages), **Dossiers**, **Factures** (règlement), **Messages** (échanges avec le cabinet), **Profil**. L'accès s'envoie depuis la fiche client (**Envoyer les accès**). Voir « Espace client ».

## Règles communes à tous les modules
- **Permissions** : chaque menu et chaque bouton exige une permission du rôle (voir, créer, modifier, supprimer sont distincts). Un bouton absent = droit manquant ou statut qui ne le permet pas. L'assistant IA applique les mêmes droits.
- **Plan d'abonnement** : les modules Paie, Dépenses, Documents, Facturation, Rapports avancés et Assistant IA doivent être **inclus** dans le plan, sinon leurs menus sont masqués et leurs actions refusées (« Le module … n'est pas inclus dans votre plan »).
- **Quotas** : employés, clients, dossiers, agences, audiences, bulletins, notes de frais, stockage — une création au-delà du quota est refusée jusqu'à la mise à niveau.
- **Référentiels réservés** : Juridictions, Diligences, Types de procédure (admin et secrétaire), Modèles, Cabinet, Parcours dossier, Administration, Abonnement (admin).

## Erreurs fréquentes
- Menu ou bouton invisible → vérifiez le rôle (Rôles & Permissions) et les modules inclus (Abonnement).
- « Le module … n'est pas inclus dans votre plan » → **Abonnement > Changer de plan**.
- « Limite de … atteinte » → mise à niveau du plan.
- « Accès refusé » → permission manquante pour votre profil.

## Depuis le chat
Demandez « comment fonctionne … » ou « comment créer … » en nommant le sujet (dossier, facture, audience, bulletin de paie, employé, dépense, document, diligence, apporteur…) et je détaille le processus d'après le guide du module. Pour une donnée précise (« factures impayées de Jean Dupont », « audiences de la semaine »), posez directement la question : j'interroge vos données dans la limite de vos droits.
