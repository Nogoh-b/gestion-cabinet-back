---
id: audiences
title: Audiences et agenda
keywords: audience, audiences, agenda, calendrier des audiences, nouvelle audience, planifier une audience, programmer une audience, reporter une audience, report d'audience, renvoi, renvoyer une audience, audience renvoyee, rapport d'audience, proces-verbal, decision d'audience, marquer tenue, audience tenue, annuler une audience, type d'audience, types d'audience, rappel d'audience, plaidoirie, mise en etat, juge, salle d'audience, audience de jugement, audience de conciliation, une audience
paths: /audiences
---

# Audiences et agenda

## À quoi ça sert
Une **audience** est un rendez-vous devant une juridiction lié à un dossier. Le module permet de la **planifier**, de la **reporter** (avec rapport obligatoire), de la marquer **tenue**, d'**enregistrer la décision** rendue et de suivre le calendrier du cabinet. Un rappel automatique est envoyé aux avocats et collaborateurs du dossier.

## Où le trouver
- Menu **Agenda** (`/audiences/calendrier`, permission « voir l'agenda ») : calendrier mensuel des audiences, une pastille de couleur par statut (Planifiée, Tenue, Reportée, Annulée), navigation de mois en mois.
- **Plus > Pilotage > Audiences** (`/audiences`, permission « voir les audiences ») : la liste avec statistiques, filtres et recherche. Boutons **Nouvelle audience** et un export des audiences d'une période.
- Depuis un dossier : l'onglet des audiences du dossier permet de planifier une audience déjà rattachée à ce dossier.
- Fiche d'une audience (`/audiences/<id>`) : onglets **Aperçu**, **Communication**, **Rapport**, **Décision**, **Documents**, **Historique**.

## Prérequis
- Un **dossier** existant : une audience est toujours rattachée à un dossier. La **juridiction** n'est pas à saisir, elle est héritée du dossier.
- (Facultatif) Un **type d'audience**. Les types fournis sont : Préliminaire, Mise en État, Plaidoirie, Instruction, Conciliation, Jugement, Appel, Expertise, Cassation, Référé. Un nouveau type se crée depuis le champ **Type d'audience** du formulaire (bouton **Nouveau type** : nom et catégorie obligatoires — Pénale, Civile, Commerciale, Administrative, Sociale ou Autre —, durée par défaut, délai de préparation, public, requiert un avocat, distanciel, actif).
- Le **quota d'audiences** du plan d'abonnement ne doit pas être atteint.

## Planifier une audience — pas à pas
1. **Plus > Pilotage > Audiences > Nouvelle audience** (ou depuis un dossier). Le formulaire a deux étapes : « Informations essentielles » puis « Informations complémentaires » (une étape « Décision » existe pour la modification).
2. **Essentielles** : **Dossier**, **Date de l'audience**. Si l'audience fait suite à un renvoi, cochez **Cette audience est issue d'un renvoi**, puis choisissez l'**Audience renvoyée** (audience d'origine du même dossier) et le **Motif du renvoi**.
3. **Compléments** : **Heure** (09:00 par défaut), **Type d'audience**, **Durée (minutes)**, **Salle**, **Nom du juge**, **Documents liés** (documents du dossier), **Notes**.
4. **Créer l'audience**.

## Champs obligatoires
**Dossier** et **Date de l'audience**. Si l'audience est issue d'un renvoi : l'audience d'origine et le **motif** sont obligatoires (« Le motif du renvoi est obligatoire »).

## Statuts et règles
- **Planifiée** → **Tenue**, **Reportée** ou **Annulée**.
- **Marquer tenue** (permission « marquer tenue ») : possible seulement une fois la date et l'heure de l'audience passées (« Impossible de marquer l'audience comme tenue car elle n'a pas encore eu lieu »).
- **Reporter** (permission « reporter une audience ») : indisponible si l'audience est déjà reportée ou annulée. Il faut saisir le **rapport d'audience** (obligatoire avant tout report), la **nouvelle date**, la **nouvelle heure** et le **motif**. L'audience d'origine passe **Reportée** et est **figée** (plus modifiable) ; une **nouvelle audience Planifiée** est créée automatiquement avec les mêmes dossier, juridiction, type, salle, juge et durée, liée à l'originale (« issue du report de #…»).
- **Annuler** (permission « annuler une audience ») : possible tant que l'audience n'est ni tenue, ni reportée, ni annulée.
- **Décision** : le bouton **Decision** n'apparaît que sur une audience **Tenue**. Il enregistre le texte de la **Décision**, l'**Issue de la décision** (Favorable, Défavorable, Partiel), la **Date de la décision**, les **Observations** et des **Documents de décision**.
- **Ajout de documents** : possible tant que l'audience n'est ni tenue ni reportée.
- **Modifier** : indisponible sur une audience reportée.

## Automatismes
- **Rappel** : toutes les heures, le système prévient (notification « Rappel d'audience ») l'avocat responsable et les collaborateurs du dossier pour toute audience Planifiée qui a lieu dans les 48 heures, une seule fois.
- Les actions (tenue, report, annulation, décision, ajout de documents) envoient des notifications d'audience.
- La procédure du dossier (étape et sous-étape en cours) est rattachée automatiquement à l'audience.

## Erreurs fréquentes
- « Le rapport d'audience doit être rédigé avant de reporter cette audience. »
- « Cette audience a déjà été reportée. » / « Une audience annulée ne peut pas être reportée. »
- « Cette audience a été reportée et ne peut plus être modifiée. Consultez l'audience de remplacement. »
- « Impossible d'ajouter une décision car l'audience n'est pas encore tenue. »
- « La nouvelle date et la nouvelle heure de l'audience sont requises pour effectuer un report. »
- Bouton absent (Reporter, Marquer tenue, Annuler…) → permission manquante ou statut qui ne le permet pas.

## Créer depuis le chat
« Programme une audience pour le dossier DOS-2026-0039 le 15 juin 2026 à 14h30, salle 4B. » Seuls le dossier et la date sont obligatoires ; la juridiction vient du dossier et l'heure par défaut est 09:00. Je peux aussi reporter une audience si vous donnez la nouvelle date et le rapport ou le motif. Une carte de confirmation modifiable s'affiche avant l'enregistrement.
