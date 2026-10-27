---
id: agences
title: Agences (bureaux du cabinet)
keywords: agence, agences, nouvelle agence, creer une agence, ajouter une agence, bureau, bureaux, succursale, siege, code d'agence, heure d'ouverture, heure de fermeture, horaires d'ouverture, agence de rattachement, gestion des agences, cabinets, archiver une agence, branche, une agence
paths: /gestion-cabinet/cabinet
---

# Agences (bureaux du cabinet)

## À quoi ça sert
Une **agence** (aussi appelée bureau ou branche) est un site physique du cabinet. Elle sert à rattacher les **employés** et les **clients** à un lieu, à filtrer la **paie** par site et à situer les fournisseurs. Au moins une agence est nécessaire pour créer des clients et des employés.

## Où le trouver
- Page **Cabinets** (`/gestion-cabinet/cabinet`, « Gestion complète des cabinets ») : liste des agences avec statistiques, recherche (nom, code), filtre **Statut** (Actif, Inactif, En maintenance) et filtre par ville. Bouton **Nouvelle agence**. Cette page n'est pas dans la barre latérale : on y accède par son adresse ou par les liens d'aide de l'application.
- Raccourci dans les formulaires : les champs **Agence** (fiche client, employé, fournisseur…) proposent **Nouvelle agence** pour en créer une sans quitter le formulaire (formulaire simplifié).
- Fiche d'une agence : onglets **Aperçu** (nom, code, nom d'affichage, statut, état d'ouverture, adresse, ville, district, région, pays, horaires), **Statistiques** (avocats, employés actifs, clients), **Employés**, **Avocats**, **Historique**.

## Prérequis
- Le **référentiel géographique** (région, arrondissement, district, ville) doit contenir le lieu de l'agence.
- Le **quota d'agences** du plan d'abonnement ne doit pas être atteint (voir Abonnement).
- Créer, modifier, archiver ou supprimer une agence est réservé à l'**administrateur**.

## Créer une agence — pas à pas
1. **Nouvelle agence** (« Créer une nouvelle agence »). Un bloc d'assistance IA peut pré-remplir nom, horaires et code depuis un texte.
2. **Nom de l'agence** (3 à 100 caractères).
3. **Localisation** en cascade : **Ville** (région), **Arrondissement**, **District**, puis **Ville** (localité) — chaque liste dépend de la précédente.
4. **Heure d'ouverture** et **Heure de fermeture** (heures de 0 à 23).
5. **Date de création** (facultative), puis **Créer l'agence**.

## Champs obligatoires
**Nom de l'agence**, la localisation complète (région, arrondissement, district, ville), l'**heure d'ouverture** et l'**heure de fermeture**. Le **code** (numéro attribué automatiquement, 999 au maximum) n'est pas à saisir.

## Statuts et règles
- Statuts : **Actif**, **Inactif**, **En maintenance**.
- **Archiver** (confirmation demandée) met l'agence de côté ; **Supprimer** est définitif (« Cette action est irréversible », avec délai d'annulation). Préférez archiver une agence qui a des employés ou des clients.
- Actions de la fiche : **Modifier**, **Exporter**, **Voir sur la carte**, **Liste des avocats**, **Liste des clients**, **Archiver**, **Supprimer**.

## Automatismes
- Le code d'agence est généré à la création.
- L'agence choisie sur un employé ou un client sert ensuite de filtre (paie par agence, statistiques de l'agence).

## Erreurs fréquentes
- « Ville non trouvée » → choisissez une ville du référentiel.
- « Impossible de générer un nouveau code : seuil maximal (999) atteint. »
- Quota d'agences dépassé → augmentez l'abonnement.
- Aucune agence proposée dans un formulaire → créez-en une d'abord.

## Créer depuis le chat
« Crée l'agence Yaoundé Centre, ville Yaoundé, ouverte de 8 h à 18 h. » L'agence reçoit un code automatique ; une carte de confirmation modifiable s'affiche avant l'enregistrement.
