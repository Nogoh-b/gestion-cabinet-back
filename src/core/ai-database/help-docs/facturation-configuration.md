---
id: facturation-configuration
title: Configuration de la facturation
keywords: configuration de la facturation, configurer la facturation, parametrer la facturation, parametres de facturation, convention d'honoraires, profil de facturation, mode de facturation, forfait, honoraires au forfait, honoraires horaires, taux horaire, vacation, honoraire de resultat, facturation automatique, regle de facturation, catalogue d'actions, traitement professionnel, tva par defaut, numerotation des factures, type de facture, types de facture, devise, refacturer les frais, frais et debours, justificatif des debours, mode mixte, recalculer les elements, profil verifie
paths: /settings/case-workflow, /settings/app, /facturation/factures/type
---

# Configuration de la facturation

La facturation se configure à **quatre niveaux**, du plus général au plus précis. Plus on descend, plus le réglage est spécifique et prioritaire.

| Niveau | Où | Qui | Sert à |
|---|---|---|---|
| 1. Cabinet | Menu du compte > **Cabinet** | Administrateur | Devise, TVA par défaut, numérotation des factures et des dossiers, frais d'ouverture par défaut |
| 2. Types de facture | Plus > Configuration > **Types de facture** | Utilisateurs avec accès aux factures | TVA et délai de paiement par type de facture |
| 3. Catalogue d'actions | Menu du compte > **Parcours dossier** | Administrateur (permission « gérer le catalogue d'actions ») | Traitement financier par défaut de chaque sous-action |
| 4. Dossier | Dossier > **Facturation > Paramètres de facturation** | Équipe du dossier | La convention d'honoraires de CE dossier |

## 1. Réglages du cabinet (menu du compte > Cabinet)
Sections utiles à la facturation :
- **Configuration** : langue, **devise** (XAF par défaut), format de date.
- **Paramètres de la devise** : symbole, position du symbole, nombre de décimales, séparateur de milliers.
- **TVA par défaut** : taux en pourcent (ex. 19,25 pour le Cameroun, 0 si exonéré). Il initialise la TVA des nouveaux profils de facturation.
- **Numérotation des factures** : choisissez un modèle prêt à l'emploi (Préfixe + Année `FAC-2026-0001`, Année/Numéro, Numéro/Année, Mensuel) ou un gabarit personnalisé avec les jetons `{PREFIX}`, `{YYYY}`, `{MM}`, `{NNNN}`, plus le **préfixe**. Un aperçu s'affiche. Le numéro de chaque facture est généré automatiquement ; ne le saisissez pas.
- **Numérotation des dossiers** : même principe (jetons supplémentaires `{YY}` et `{DD}`), par exemple `DOS-2026-0001`.
- **Frais d'ouverture de dossier** : interrupteur d'activation, **montant HT**, **taux de TVA** de ces frais et **libellé** de la ligne. Ce montant est le défaut du cabinet ; un montant saisi sur un dossier (champ « Frais d'ouverture » à l'ouverture, ou paramètre du profil de facturation) **prime toujours**.

## 2. Types de facture
Plus > Configuration > **Types de facture**. Un type porte : un **code unique**, un **nom**, une **catégorie** (Honoraires, Frais, Acompte, Règlement, Autre), le **taux de TVA par défaut**, « Exonéré de TVA », « Facturable », « Requiert approbation », « Actif », le **délai de paiement (jours)** et un **code comptable**. Le type choisi sur une facture fixe sa TVA et son échéance par défaut.

## 3. Catalogue d'actions (menu du compte > Parcours dossier)
Le catalogue décrit les **familles** d'actions et leurs **sous-actions**. Pour la facturation, chaque sous-action indique :
- **Rémunération professionnelle** (traitement par défaut) :
  - **Suivre la convention du dossier** : dossier au forfait ou mixte → l'action est *incluse dans le forfait* (aucun supplément) ; dossier horaire → *honoraire au temps passé* ; sinon → à vérifier.
  - **Honoraire au temps passé** : durée × taux horaire.
  - **Vacation** : un tarif à l'unité (audience, comparution…).
  - **Aucune rémunération** : travail non répercuté au client.
  - **À vérifier à la clôture** : l'action crée un élément « À déterminer » qu'il faut valider.
- **Des frais peuvent être associés** / **Des débours peuvent être associés** : simple indication affichée à la clôture de l'action. Elle **ne crée aucune dépense** : les frais et débours se saisissent à part (voir « Dépenses »).
- **Mode de calcul** et **tarif particulier** (laissez vide pour utiliser le tarif du dossier), délai par défaut, priorité, obligatoire, résultats possibles, champs spécifiques et éléments requis.
- Boutons **Famille**, **Ajouter** (sous-action) et **Réviser** : la révision crée une nouvelle version sans réécrire l'historique.

Le même écran contient les **règles de recommandation** (quelle action proposer après tel événement), le suivi de déploiement V2 et les correspondances de migration de l'ancien workflow.

## 4. Paramètres de facturation d'un dossier
Chemin : fiche du dossier > **Facturation** > **Paramètres de facturation**. Un profil est créé avec le dossier (devise et TVA repris du cabinet, mode Forfait, frais et débours refacturables, justificatif de débours exigé).

**Honoraires principaux**
- **Mode de facturation** : **Forfait**, **Horaire** ou **Mixte** (le « Pourcentage » n'est plus proposé que pour un ancien profil).
- **Devise** (XAF, EUR, USD, CAD, GBP).
- **Montant du forfait**, **Tarif horaire**, **Tarif habituel d'une vacation**.
- **TVA** du dossier (en %).

**Ouverture du dossier**
- **Facturer des frais d'ouverture** + **Montant des frais d'ouverture**.
- **Inclus dans le forfait** : si coché, les frais d'ouverture ne forment pas de ligne séparée. Par défaut ils restent distincts du forfait.

**Honoraire de résultat**
- **Prévoir un honoraire de résultat** + **Taux prévu (%)**. Le taux est seulement préparé : aucun honoraire de résultat n'est créé sans validation manuelle (voir « Éléments facturables »). Il ne peut jamais être la seule rémunération du dossier.

**Frais et débours** (s'appliquent aux dépenses réelles *approuvées* du dossier)
- **Refacturer les frais du cabinet**
- **Refacturer les débours payés pour le client**
- **Exiger un justificatif pour les débours**

**Profil vérifié et confirmé** : case à cocher à valider une fois les paramètres relus.

**Facturation automatique (règles propres au dossier)**
- **Quand facturer ?** : Action terminée, Audience créée, Audience tenue, Diligence terminée.
- **Action concernée** (obligatoire pour « Action terminée »).
- **Mode de calcul** : Forfait fixe, Selon le temps passé, À la vacation / à l'unité, plus le **tarif**.
- Bouton **Configurer l'automatisme** ; la règle apparaît avec le badge **Actif** et peut être **Désactivée**.
- La règle du dossier **prime sur le tarif général** du dossier et sur celui du catalogue. Attention : si une règle « Action terminée » et une règle « Audience tenue » visent le même travail, risque de double rémunération — gardez-en une seule.

## Règles de modification
- Modifier le profil s'applique aux **événements futurs**, et à l'enregistrement le **forfait principal** et les **frais d'ouverture** (montant, TVA, devise) sont repris automatiquement :
  - élément pas encore facturé → mis à jour (un forfait « à vérifier » faute de montant passe « à facturer ») ;
  - élément sur une **facture brouillon sans paiement** → la ligne et les totaux de la facture sont ajustés ;
  - **facture émise, payée ou annulée** → jamais modifiée ; un message le signale : faites un avoir ou une facture complémentaire ;
  - forfait absent alors que le profil en prévoit un → créé « à facturer » (sans facture automatique) ;
  - passage en horaire, frais d'ouverture désactivés ou inclus dans le forfait → l'élément ouvert passe « à vérifier » (à abandonner ou conserver).
  Un message récapitule ces effets après l'enregistrement. Avant la validation de l'ouverture du dossier, rien n'existe encore : tout est créé à l'ouverture avec le profil courant.
- Les éléments issus des **actions** gardent leur ancien tarif : page Facturation du dossier > **Recalculer les éléments ouverts** → un aperçu avant/après s'affiche, puis **Appliquer le recalcul**. Aucun élément réservé ou facturé n'est touché.
- Un changement de mode (forfait ↔ horaire) peut être appliqué aux éléments ouverts avec le même principe de confirmation.

## Pas encore configurable à l'écran
Le **mapping comptable par catégorie** (quel compte de produits pour honoraires, vacations, frais, débours, résultat) est utilisé par le système mais n'a pas encore d'écran. À défaut, tout va au compte 706 avec un avertissement dans les journaux. À faire valider par votre comptable. Un **échéancier de forfait** (50 % / 50 %) et un rapport de rentabilité par dossier ne sont pas non plus disponibles.

## Questions fréquentes
- *Où régler le tarif horaire ?* Dans les paramètres de facturation du dossier (ou sur une règle automatique, ou sur la sous-action du catalogue).
- *Quel tarif s'applique ?* Règle automatique du dossier, sinon tarif de la sous-action, sinon tarif du dossier.
- *Pourquoi mes frais ne sont pas facturés ?* Vérifiez « Refacturer les frais du cabinet » / « Refacturer les débours » et, pour un débours, la présence du justificatif.
- *Comment changer la TVA ?* Cabinet > TVA par défaut (nouveaux dossiers), ou TVA du profil du dossier (ce dossier).
