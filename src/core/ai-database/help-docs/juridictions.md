---
id: juridictions
title: Juridictions
keywords: juridiction, juridictions, nouvelle juridiction, creer une juridiction, ajouter une juridiction, tribunal, tribunaux, cour d'appel, tribunal de premiere instance, juridiction parente, niveau de juridiction, type de juridiction, referentiel juridictions, numero de tribunal, juge principal, une juridiction
paths: /dossiers/juridiction
---

# Juridictions

## À quoi ça sert
Une **juridiction** est un tribunal ou une cour (Tribunal de Première Instance, Cour d'Appel…) devant lequel un dossier est plaidé. Le référentiel des juridictions est choisi à l'**ouverture d'un dossier** ; les **audiences** du dossier en héritent ensuite automatiquement. On peut organiser les juridictions en hiérarchie (une cour d'appel rattachée à une région, par exemple) grâce à la **juridiction parente**.

## Où le trouver
- **Plus > Configuration > Référentiels dossiers** (`/dossiers/juridiction`, rôles administrateur et secrétaire, permission « voir les dossiers ») : la liste « Juridictions », avec statistiques, recherche et filtres. Bouton **Nouvelle juridiction**.
- Fiche d'une juridiction : onglets **Aperçu** (nom, code, description, adresse, ville, région, pays, type, niveau, statut, téléphone, e-mail, site web), **Audiences** et **Dossiers**. Actions : **Modifier**, **Exporter**, **Voir les audiences**, **Contacter par email**, **Appeler**, **Visiter le site**, **Archiver**, **Supprimer**.

## Prérequis
Aucun : le référentiel est utilisable tout de suite. Un jeu de juridictions du Cameroun (tribunaux de première instance de Yaoundé, Douala, Bamenda ; cours d'appel…) est fourni à l'installation du cabinet.

## Créer une juridiction — pas à pas
1. **Nouvelle juridiction** (« Créer une juridiction »). Un bloc d'assistance IA peut pré-remplir les champs depuis un texte.
2. **Identification** : **Nom de la juridiction** (obligatoire), **Code unique** (facultatif : généré automatiquement si laissé vide, 20 caractères maximum, lettres, chiffres et _), **Niveau** (Municipal, Régional, National, International), **Type de juridiction** (Civil, Commercial, Administratif, Pénal, Travail, Famille), **Description**.
3. **Localisation et contact** : **Ville**, **Région**, **Pays**, **Adresse complète**, **Téléphone**, **Email**, **Site web**.
4. **Organisation** : **Juridiction parente** (liste des juridictions existantes, avec le bouton **Créer une juridiction parente**), **Numéro de tribunal**, **Nom du juge principal**, **Actif**.
5. **Créer**.

## Champs obligatoires
Seul le **Nom** est obligatoire. Sans choix, le niveau est « Régional » et le type « Civil ».

## Règles
- Le **code** doit être unique : « Une juridiction avec le code … existe déjà ».
- **Actif** indique si la juridiction est actuellement utilisable.
- **Supprimer** est définitif (confirmation avec délai) ; préférez **Archiver** ou décocher **Actif** si la juridiction a déjà servi à des dossiers ou des audiences.

## Automatismes
- La juridiction choisie sur un dossier est reprise sur toutes ses audiences : on ne la ressaisit pas.

## Erreurs fréquentes
- « Une juridiction avec le code … existe déjà » → changez le code ou laissez-le vide.
- Juridiction absente de la liste lors de l'ouverture d'un dossier → créez-la d'abord dans ce référentiel.
- Menu absent → ce référentiel est réservé aux rôles administrateur et secrétaire.

## Créer depuis le chat
« Crée la juridiction Tribunal de Première Instance de Garoua, ville Garoua, niveau régional, type civil. » Seul le nom est requis ; je vérifie qu'il n'existe pas déjà. Une carte de confirmation modifiable s'affiche avant l'enregistrement.
