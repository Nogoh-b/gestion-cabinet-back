---
id: parcours-dossier
title: Parcours dossier (catalogue d'actions)
keywords: parcours dossier, parcours oriente actions, catalogue d'actions, catalogue, famille d'action, familles d'actions, sous-action, sous-actions, nouveaux dossiers en v2, activer le parcours, recommandation d'action, regles de recommandation, revision du catalogue, reviser une action, migration v2, suivi du deploiement, correspondance de migration, traitement par defaut, delai par defaut, action obligatoire, resultats possibles
paths: /settings/case-workflow
---

# Parcours dossier (catalogue d'actions)

## À quoi ça sert
Le **Parcours dossier** définit *comment* les dossiers avancent : le **catalogue d'actions** (familles et sous-actions avec leur traitement financier par défaut), les **règles de recommandation** (quelle action proposer après tel événement) et le choix du moteur des nouveaux dossiers (**« Nouveaux dossiers en V2 »**). C'est ici que l'administrateur modélise la méthode du cabinet.

## Où le trouver
- Menu du compte (avatar) > **Parcours dossier** (`/settings/case-workflow`, administrateur, permission « gérer le catalogue d'actions »).
- Carte **« Parcours dossier orienté actions »** avec le réglage **« Nouveaux dossiers en V2 »** : activé, les nouveaux dossiers suivent le parcours en 3 phases (Ouverture → Traitement → Clôture) ; sinon l'ancien workflow. Un dossier garde son moteur d'origine sauf migration explicite.
- Cartes **Suivi du déploiement V2** (compteurs de migration) et **Correspondances de migration** (ancien statut → action V2).

## Le catalogue — pas à pas
1. **Familles** : bouton **Famille** — **libellé**, description, ordre d'affichage, **famille active**. Ex. Analyse, Rédaction, Audience, Contact client.
2. **Sous-actions** : bouton **Ajouter** dans une famille — **libellé**, famille, **délai par défaut (jours)**, **priorité** par défaut, **obligatoire** (bloque la clôture si ouverte), **active**, **facturable par défaut**, **traitement professionnel par défaut** (Suivre la convention du dossier / Honoraire au temps passé / Vacation / Aucune rémunération / À vérifier à la clôture), **mode de calcul** + **tarif particulier** (vide = tarif du dossier), **des frais / des débours peuvent être associés** (simple rappel à la clôture, ne crée rien), **résultats possibles** (choix proposés à la clôture), **champs spécifiques**, **éléments requis** (documents, audiences).
3. **Réviser** : toute modification d'une sous-action crée une **nouvelle version** (bouton **Réviser**, « Réviser … ») sans réécrire l'historique : les actions déjà créées gardent leur version.
4. Inactives : décochez **active** plutôt que supprimer — l'historique reste lisible.

## Les règles de recommandation
- Carte **Règles de recommandation** : **déclencheur** (Ouverture validée, Action terminée, Audience proche, Audience reportée, État d'un document modifié, Pièce manquante, Échéance atteinte, Aucune action ouverte, Réévaluation manuelle), **action proposée**, conditions, **texte du motif**, priorité, spécificité, décalage d'échéance, **règle active**.
- Bouton **Ajouter** (création, « Règle de recommandation créée »), **Réviser**, activation / désactivation (« Règle activée / désactivée »).
- Dans le dossier, la recommandation apparaît avec **Commencer** ou **Reporter**.

## Règles
- Réservé à l'**administrateur** (permission « gérer le catalogue d'actions »).
- Le traitement financier choisi ici est le **défaut** : la règle automatique du dossier prime, puis le tarif de la sous-action, puis le tarif du dossier (voir « Configuration de la facturation »).
- Les cases « frais / débours possibles » n'ajoutent **aucune** dépense : les frais se saisissent dans Dépenses.
- Une action **obligatoire** encore ouverte **bloque la clôture** du dossier.

## Erreurs fréquentes
- Menu Parcours dossier invisible → vous n'êtes pas administrateur.
- Anciens dossiers sans actions → créés avant V2 : migrez-les (correspondances de migration) ou gardez l'ancien workflow en lecture seule.
- Recommandation absente → aucune règle active pour cet événement, ou action proposée inactive.

## Depuis le chat
Le catalogue se règle dans cette page, pas depuis le chat. Je peux en revanche expliquer le traitement financier d'une action et guider la création d'actions dans un dossier.
