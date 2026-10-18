---
id: documents
title: Documents
keywords: document, documents, nouveau document, ajouter un document, uploader un document, televerser un document, piece jointe, pieces du dossier, gestion des documents, type de document, types de documents, nature du document, categorie de document, categories de documents, referentiels documents, telecharger un document, archiver un document, mots-cles du document, confidentialite, stockage, espace de stockage, ged
paths: /documents, /categories
---

# Documents

## À quoi ça sert
Le module Documents conserve les **pièces et fichiers** du cabinet (contrats, conclusions, jugements, pièces d'identité, courriers…), toujours rattachés à un **dossier** — et, par lui, à un client. Chaque document est classé par **catégorie** et par **nature** (type), et peut être rattaché à une **étape** ou **sous-étape** de la procédure du dossier.

## Où le trouver
- Menu **Documents** (`/documents`, section « Relation client », permission « voir les documents », module Documents inclus dans le plan d'abonnement) : liste avec statistiques, recherche et filtres. Bouton **Nouveau document**.
- Fiche d'un document (`/documents/<id>`) : onglets **Aperçu** (nom, statut, version, taille, type MIME, catégorie, confidentialité, dossier, client, dates, validité) et **Historique**.
- **Plus > Configuration > Référentiels documents** (`/documents/type`) : les **types de documents** (« Nouveau type de document »). Son raccourci **Catégories** (`/categories`) : les **catégories**.
- Les documents d'un dossier sont aussi visibles dans l'onglet documents de la fiche du dossier ; ceux d'un client sur sa fiche (onglet **Documents**).

## Prérequis
- Un **dossier** existant (le document y est rangé).
- (Facultatif mais recommandé) une **catégorie** et une **nature** de document, pour classer. Si elles sont absentes, le document est rangé dans « Documents non classés » / « Pièces diverses ».
- De l'**espace de stockage** disponible dans le plan d'abonnement.

## Ajouter un document — pas à pas
1. **Documents > Nouveau document** (ou depuis la fiche du dossier). Le formulaire a deux blocs.
2. **Informations essentielles** : **Dossier**, **Fichier**, **Note** (description permettant d'identifier le document). Un bloc d'assistance IA peut lire le fichier et pré-remplir nom, description, mots-clés et date.
3. **Informations complémentaires** : **Catégorie**, **Nature du document** (liste filtrée par la catégorie ; bouton **Nouveau type** pour en créer une à la volée), **Nom du document**, **Date du document**, **Mots-clés**, **Visite d'étape** et **Visite de sous-étape** (rattachement à la procédure du dossier).
4. **Uploader le document**. Si le nom est vide, le nom du fichier est utilisé.

Champs obligatoires : **Dossier** et **Fichier** (plus **Nom** et **Note** dans le formulaire classique). Taille maximale d'un envoi : 50 Mo.

## Statuts et règles
- Statuts : **En attente**, **Validé**, **Rejeté**, **Expiré**, **Archivé**.
- Actions de la fiche : **Télécharger** (permission « télécharger un document »), **Modifier**, **Voir le fichier**, **Voir le dossier**, **Remettre en attente** (permission de rejeter), **Archiver** (permission d'archiver), **Supprimer** (permission de supprimer).
- Remplacer le fichier d'un document **incrémente sa version** (champ Version de l'aperçu).
- Un type de document peut définir un **type de fichier accepté**, une **taille maximale**, une **durée de validité** et s'il est **obligatoire**.

## Les types de documents (Nature)
Formulaire « Nouveau type de document » : **Nom du document** (obligatoire), **Catégorie** (obligatoire), **Description**, **Document obligatoire**, **Durée de validité (jours)**, **Type de fichier accepté** (Images, PDF, Tous les documents, Aucune restriction), **Taille maximale (MB)**, **Statut**, **Types de clients associés** (documents exigés pour tel type de client).

## Les catégories
Formulaire catégorie : **Nom** (obligatoire), **Code** (facultatif), **Description**, **Icône**, **Couleur**, **Niveau de confidentialité** (Public, Interne, Confidentiel), **Ordre de tri**, **Période de rétention (jours)**, **Taille max. fichier (MB)**, **Catégorie active**.

## Automatismes
- Le fichier est rangé dans l'arborescence du cabinet : cabinet / numéro du dossier / catégorie / nature.
- Les collaborateurs du dossier sont notifiés des ajouts, modifications, archivages et suppressions.

## Erreurs fréquentes
- « Aucun fichier uploadé » → le fichier est obligatoire.
- « Espace de stockage insuffisant (… Go / … Go utilisés) » → quota de stockage du plan atteint (voir Abonnement).
- « Dossier … non trouvé » / « Type de document non trouvé » → choisissez un élément existant.
- Boutons absents → permissions de document insuffisantes (envoyer, modifier, télécharger, archiver, supprimer sont distinctes).

## Créer depuis le chat
Joignez le fichier à votre message et dites par exemple « Classe ce document dans le dossier DOS-2026-0039, nature Contrat ». L'application rattache le fichier joint : je ne peux pas créer de document sans fichier. Le document est analysé pour proposer nom et classement, puis une carte de confirmation s'affiche.
