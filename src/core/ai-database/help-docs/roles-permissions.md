---
id: roles-permissions
title: Rôles et permissions
keywords: role, roles, rôles et permissions, roles et permissions, gestion des roles, permission, permissions, droits d'acces, droits utilisateur, profil d'acces, donner un acces, retirer un acces, acces refuse, verrouillee, role systeme, tout cocher, qui peut voir, qui a acces, administrateur, secretaire, avocat, comptable, stagiaire, huissier, manage_roles, habilitation, un role
paths: /settings/roles, /roles
---

# Rôles et permissions

## À quoi ça sert
Chaque personne qui se connecte a un **rôle** (profil d'accès). Un rôle est un ensemble de **permissions** (voir, créer, modifier, supprimer… pour chaque module). Les permissions décident des **menus visibles**, des **boutons disponibles** et des **données que l'assistant IA peut lire ou écrire** : l'IA applique les mêmes droits que l'interface.

## Où le trouver
- Menu du compte (avatar) > **Cabinet** / **Préférences** : ouvre l'espace « Paramètres », dont l'onglet **Rôles & Permissions** (`/settings/roles`) est réservé à l'**administrateur**. La page s'intitule « Gestion des rôles et permissions ». Les autres onglets de cet espace : Mon profil, Préférences, Cabinet, Parcours dossier.
- Le rôle d'une personne se choisit dans sa fiche employé (champ **Profil d'accès**, voir Employés).
- Opération réservée aux détenteurs de la permission « gérer les rôles » (l'administrateur).

## Les rôles fournis
Administrateur, Avocat, Collaborateur, Comptable, Secrétaire, Huissier, Stagiaire, Personnel de support, Apporteur d'affaire, et **Client** (portail client). Les rôles **Administrateur** et **Client** sont des rôles système protégés : ils ne peuvent être ni supprimés ni recréés. L'administrateur dispose de tous les droits du cabinet.

## Modifier les permissions d'un rôle — pas à pas
1. Ouvrez **Rôles & Permissions**. À gauche, la colonne **Rôles** liste chaque rôle avec son nom, son code et son nombre de permissions.
2. Cliquez sur un rôle : le panneau « Permissions — <rôle> » s'affiche à droite. Un badge **Rôle système** signale les rôles intégrés.
3. Les permissions sont regroupées par module : Dossiers, Audiences, Factures & Finances, Diligences, Clients, Documents, Agenda, Utilisateurs & Admin, Communications, Rapports, Apporteurs, Paie, Demandes employés (congés & avances), Comptabilité, Dépenses, etc. Chaque section indique « actives / total ».
4. **Cochez ou décochez** une permission : elle est **enregistrée immédiatement** (« Enregistrement… » pendant la sauvegarde).
5. Cases de section : cochent ou décochent toute la section ; **Tout cocher / Tout décocher** agit sur tout le rôle ; **Réduire tout** / **Développer tout** replient ou ouvrent les sections.
6. Les changements concernent toutes les personnes qui ont ce rôle.

## Règles
- Une permission **verrouillée** (« Permission système non modifiable ») ne peut pas être changée ; les permissions de la plateforme (gestion des cabinets, plans d'abonnement, super-administration) ne sont jamais attribuables par un cabinet.
- Un nouveau rôle personnalisé a un **code** en minuscules (lettres, chiffres, _ ; 64 caractères au plus), jamais « admin » ni « client » ; il hérite d'un rôle de base (Collaborateur par défaut). Son code doit être unique (« Le rôle existe déjà »).
- Un rôle ne peut pas être **supprimé** tant que des utilisateurs le portent : « Réaffectez les utilisateurs avant de retirer ce rôle. »
- Un rôle introuvable ou inactif ne donne **aucune** permission.
- **Client** : le portail client est « refus par défaut » : seules les routes expressément ouvertes aux clients leur sont accessibles.
- Les montants sensibles (salaires, commissions d'apporteurs, tarifs…) ont leurs propres permissions financières ; sans elles les champs sont masqués.

## Erreurs fréquentes
- « Accès refusé » / bouton ou menu absent → la permission correspondante n'est pas cochée pour le rôle de la personne.
- « Erreur lors de la modification. Réessayez. » → enregistrement impossible (réseau, permission verrouillée).
- « La permission système … ne peut pas être attribuée. »
- « Code de rôle invalide ou réservé. » / « Rôle système protégé. »
- L'assistant IA répond « Accès non autorisé » → le rôle de la personne ne permet pas de lire ces données.

## Créer depuis le chat
Les rôles et leurs permissions se règlent depuis la page **Rôles & Permissions**, pas depuis le chat. Je peux en revanche vous expliquer comment ils fonctionnent, et créer un employé en lui donnant son profil d'accès.
