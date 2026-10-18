---
id: procedures
title: Procédures (types, modèles et procédures en cours)
keywords: type de procedure, types de procedure, nouveau type de procedure, creer un type de procedure, sous-type de procedure, type parent, procedure, procedures, modele de procedure, modeles de procedure, template de procedure, templates de procedure, nouveau template, procedure en cours, procedures en cours, nouvelle procedure, instance de procedure, etape de procedure, sous-etape, sous-etapes, passer a l'etape suivante, workflow de procedure, duree moyenne, procedure civile, procedure penale
paths: /dossiers/procedure, /procedures
---

# Procédures : types, modèles et procédures en cours

Ce module regroupe trois notions voisines, à ne pas confondre :
- le **type de procédure** : le classement juridique d'un dossier (Civile, Pénale, Administrative… et leurs sous-types) ;
- le **modèle de procédure** (« template ») : le déroulé type, en **étapes** et **sous-étapes**, d'une procédure ;
- la **procédure en cours** (instance) : l'application d'un modèle à une affaire, avec sa progression.

## À quoi ça sert
Le type de procédure sert à **classer les dossiers** (choisi à l'ouverture du dossier, avec son sous-type) et à filtrer ou analyser. Le modèle décrit les phases à parcourir (par exemple Instruction, Jugement, Appel) et les sous-étapes à accomplir à chacune. La procédure en cours suit l'avancement réel.

## Où le trouver
- **Types de procédure** : **Plus > Configuration > Référentiels dossiers**, raccourci **Types de procédure** (`/dossiers/procedure`, rôles administrateur et secrétaire). Liste « Types de procédure » avec bouton **Nouveau type de procédure**. Fiche d'un type : onglets **Vue d'ensemble** (nom, code, description, statut, type, niveau hiérarchique, chemin complet, dossiers liés, sous-types, documents requis, juridictions, durée estimée) et **Templates** ; bouton **Désactiver / Activer**.
- **Modèles de procédure** : page « Templates de procédure » (`/procedures/templates`), accessible depuis l'espace **Administration** (menu du compte > Administration, administrateur).
- **Procédures en cours** : page « Procédures en cours » (`/procedures/instances`).

## Prérequis
- Pour classer un dossier : au moins un **type de procédure actif**. Des types et sous-types usuels sont fournis (Contentieux civil – Procédure ordinaire, Divorce, Succession, Litige immobilier, Injonction de payer, Référé, Appel, Cassation, Procédure pénale, Redressement judiciaire…).
- Pour une procédure en cours : un **modèle actif comportant au moins une étape**.

## Créer un type de procédure — pas à pas
1. **Nouveau type de procédure** (« Créer un type de procédure »). Un bloc d'assistance IA peut pré-remplir le formulaire depuis un texte.
2. Renseignez : **Nom du type de procédure** (obligatoire, 100 caractères maximum), **Code unique** (facultatif, généré si vide ; majuscules, chiffres et _), **Type parent** (pour créer un **sous-type** ; bouton **Créer un type parent**), **Description** (500 caractères maximum), **Procédure à utiliser** (modèle de procédure associé, facultatif), **Durée moyenne (en jours)** (1 à 3650), **Type actif**.
3. **Créer le type de procédure**.

## Créer un modèle de procédure
1. Page **Templates de procédure** > **Nouveau template**.
2. **Informations générales** : **Nom du template** (obligatoire, unique), **Description**.
3. **Ajouter une étape** (une étape par phase : Instruction, Jugement, Appel…) : **Nom de l'étape** (obligatoire), **Description**, **Peut être sautée**, **Peut être revisitée** ; dans chaque étape, ajoutez ses **sous-étapes** (nom, description, **Obligatoire**).
4. Définissez si besoin les **transitions** (passage d'une étape à une autre, avec conditions) et les **retours arrière** (cycles) ; un aperçu visuel du déroulé est disponible.
5. Enregistrez. Sur la liste, chaque modèle propose **Voir**, **Modifier**, **Dupliquer** et **Supprimer**, et un filtre « Afficher uniquement les templates actifs ». Un modèle affiche sa **version** et son nombre d'étapes.

## Lancer et suivre une procédure en cours
1. **Procédures en cours > Nouvelle procédure** : **Type de procédure** (choix du modèle, obligatoire), **Titre de la procédure** (obligatoire), **Description**, **Client**.
2. La procédure démarre à la **première étape** du modèle. Sur sa fiche : schéma du workflow, progression globale, sous-étapes de l'étape courante à démarrer puis à **valider** (certaines sous-étapes exigent des champs ou des pièces), puis **Passer à l'étape suivante** quand une transition est disponible, ou **Retours arrière possibles** (limités par le nombre maximum de répétitions défini dans le modèle).
3. Une procédure peut être **réinitialisée** (toutes les sous-étapes validées sont remises à zéro).

## Statuts
- **Type de procédure** : Actif / Inactif.
- **Modèle** : Actif / Inactif, avec numéro de version.
- **Procédure en cours** : En cours, Suspendue, Clôturée, Abandonnée.

## Règles
- Le **nom** d'un type de procédure doit être unique, son **code** aussi (« Un type de procédure avec ce nom / ce code existe déjà »).
- Un type **utilisé dans des dossiers** ou ayant des **sous-types** ne peut pas être supprimé : désactivez-le.
- Un modèle sans aucune vraie étape ne peut pas démarrer de procédure.
- Pour un dossier dont le **parcours dossier** (menu du compte > Parcours dossier) est confirmé, l'ancien suivi par modèle devient en **lecture seule**.

## Erreurs fréquentes
- « Un type de procédure avec ce nom existe déjà. »
- « Impossible de supprimer un type de procédure utilisé dans des dossiers. »
- « Impossible de supprimer un type de procédure ayant des sous-types. »
- « Cette sous-étape a déjà été complétée. »
- « Le workflow historique du dossier … est en lecture seule depuis la confirmation du parcours V2. »

## Créer depuis le chat
« Crée le type de procédure Droit maritime, durée moyenne 240 jours » ou « Crée le sous-type Divorce par consentement mutuel sous le type Civile. » Je peux aussi créer un modèle (nom obligatoire) ou lancer une procédure à partir d'un modèle existant. Une carte de confirmation modifiable s'affiche avant l'enregistrement.
