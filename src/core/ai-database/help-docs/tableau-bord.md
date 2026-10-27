---
id: tableau-bord
title: Tableau de bord
keywords: tableau de bord, dashboard, page d'accueil, accueil de l'application, indicateurs, indicateurs cles, cartes du tableau de bord, raccourcis du tableau de bord, a surveiller, points a surveiller, alertes du tableau de bord, activite recente, actions avocat, diligences a traiter, performances, onglets du tableau de bord, vue d'ensemble, onglet finances, onglet activite, onglet equipe
paths: /dashboard
---

# Tableau de bord

## À quoi ça sert
Le **Tableau de bord** est la page d'accueil après connexion : il résume en un coup d'œil **où en est le cabinet** (indicateurs clés), **ce qui demande votre attention** (bandeau À surveiller) et **ce que vous avez à faire** (diligences, échéances, audiences), avec des raccourcis vers les trois parcours principaux.

## Où le trouver
- Menu **Tableau de bord** (`/dashboard`, permission « voir le tableau de bord »), premier élément de la barre latérale. En cas d'échec de chargement : « Impossible de charger le tableau de bord » avec réessai.

## Contenu, de haut en bas
1. **Message d'accueil** personnalisé (bonjour + résumé du jour).
2. **Raccourcis principaux** : trois tuiles — **Ouverture de dossier** (« Créer un nouveau dossier », `/dossiers/ouverture`, permission « créer un dossier »), **Gestion de dossiers** (« Suivre et piloter les dossiers », `/dossiers`, permission « voir les dossiers »), **Facturation Dossiers** (« Facturer et encaisser », `/facturation`, permission « voir les éléments facturables », module Facturation du plan). Chaque tuile est masquée sans le droit ou le module correspondant.
3. **Indicateurs clés** : cartes de chiffres (dossiers, audiences, clients, finances…) avec tendance par rapport au mois précédent. Les montants financiers n'apparaissent que si votre rôle a les droits financiers.
4. **À surveiller** : bandeau affiché seulement s'il y a au moins un point d'attention, avec un chip cliquable par signal : **dossiers urgents** (`/dossiers`), **diligences en retard** (`/dossiers/diligences`), **factures impayées** (`/facturation/factures`), **documents en attente** (`/documents`), **audiences à venir** (`/audiences`). Le total est rappelé dans le bandeau.
5. **Actions avocat** : vos diligences à traiter, échéances proches et audiences, limitées aux 5 premières lignes par section avec lien « voir tout » vers la page métier.
6. **Analyses** (onglets) : **Vue d'ensemble** (graphiques de performance + activité récente), **Finances** (visible avec les permissions d'analyse financière), **Activité**, **Équipe**.

## Règles
- Chaque bloc respecte vos **permissions** : un avocat ne voit que ses dossiers, sans les montants financiers s'il n'y a pas droit ; un comptable voit les finances.
- Les chiffres portent sur **votre cabinet** uniquement.
- Les liens de chaque section ouvrent la liste métier correspondante (Gérer les dossiers, Voir les audiences…).

## Erreurs fréquentes
- Page vide ou « Impossible de charger » → réessayez (bouton de réessai) ; si ça persiste, vérifiez la connexion.
- Tuile ou onglet manquant → permission manquante ou module non inclus dans le plan (Facturation pour la tuile Facturation).
- Chiffres à zéro alors que des dossiers existent → dossiers confidentiels non accessibles avec votre profil, ou filtres de période.

## Depuis le chat
Pour un chiffre précis (« combien de dossiers ouverts ce mois ? », « total des impayés ? »), posez directement la question au chat : il interroge vos données dans la limite de vos droits. Le tableau de bord reste le meilleur endroit pour la vue d'ensemble.
