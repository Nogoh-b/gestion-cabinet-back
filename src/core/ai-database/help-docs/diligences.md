---
id: diligences
title: Diligences
keywords: diligence, diligences, nouvelle diligence, creer une diligence, mission de diligence, due diligence, audit juridique, finding, findings, ajouter un finding, constat, rapport de diligence, generer le rapport, marquer terminee, echeance de diligence, diligence en retard, perimetre de la diligence, avocat assigne, mission confidentielle, une diligence
paths: /dossiers/diligences
---

# Diligences

## À quoi ça sert
Une **diligence** est une **mission de travail confiée à un avocat** dans un dossier : audit juridique (due diligence d'acquisition, d'investissement, de conformité…), vérification, analyse. Elle a un périmètre, une date limite, des **findings** (constats, risques identifiés) et un **rapport**. C'est aussi la vue « à faire » d'une action de dossier confiée à un collaborateur.

## Où le trouver
- **Plus > Configuration > Référentiels dossiers**, raccourci **Diligences** (`/dossiers/diligences`, rôles administrateur et secrétaire pour ce menu) : liste avec statistiques, recherche et filtres, bouton **Nouvelle diligence**.
- Fiche d'une diligence : onglets **Aperçu** (description, budget, type, synthèse des findings, recommandations, rapport, complétion), **Findings**, **Documents**, **Communication**. Actions : **Modifier**, **Télécharger** (export), **Ajouter un finding**, **Associer un document**, **Générer rapport**, **Marquer terminée**.
- Les diligences d'un dossier sont aussi accessibles depuis la fiche du dossier.

## Prérequis
- Un **dossier** existant.
- (Facultatif) un **avocat assigné** (un nouvel avocat peut être créé depuis le champ avec **Nouvel avocat**).

## Créer une diligence — pas à pas
1. **Nouvelle diligence** (« Créer une mission de diligence »). Trois étapes.
2. **Mission** : **Dossier**, **Titre de la mission** (5 à 255 caractères), **Type de diligence** (Acquisition, Investissement, Introduction en bourse, Conformité, Contentieux, Contrat), **Priorité** (Basse, Moyenne, Haute, Critique), puis **Visite d'étape** / **Visite de sous-étape** (rattachement à la procédure, facultatif).
3. **Description** : **Description** et **Périmètre de la diligence** (contrats, propriété intellectuelle, litiges…).
4. **Planification** : **Avocat assigné**, **Date de début**, **Date limite**, **Mission confidentielle** (cochée par défaut).
5. **Créer**. Un bloc d'assistance IA peut pré-remplir le formulaire à partir d'un texte ou d'un document.

## Champs obligatoires
**Dossier**, **Titre**, **Type**, **Priorité**, **Date de début** et **Date limite**. La date limite doit être **postérieure** à la date de début.

## Statuts et règles
- Statuts : **Brouillon** (à la création), **En cours**, **En relecture**, **Terminée**, **Annulée**.
- **Marquer terminée** : disponible tant que la diligence n'est ni terminée ni annulée ; elle enregistre la date de complétion.
- **Ajouter un finding** (permission dédiée) : **Diligence**, **Titre**, **Sévérité** (Critique, Élevé, Moyen, Faible, Information), **Catégorie** (Droit des sociétés, Contrats, Social, Fiscal, Propriété intellectuelle, Contentieux, Immobilier, Réglementaire, Conformité, Financier, Autre), **Statut** (Identifié, En analyse, Validé, Résolu, Accepté par le client) obligatoires ; en option **Confidentiel**, **Description**, **Base légale / Jurisprudence**, **Impact potentiel**, **Montant estimé du risque**, **Date butoir**.
- **Associer un document** : rattache des documents existants à la diligence.
- **Générer rapport** : marque le rapport comme généré ; le bouton **Télécharger** de l'en-tête n'est actif qu'une fois le rapport généré.
- **Ajouter une note** : fonction annoncée mais pas encore disponible (bouton grisé).

## Automatismes
- À la création, l'**avocat assigné est notifié**. Quand la diligence passe à Terminée, une notification de fin est envoyée.
- **Alertes d'échéance** (chaque jour à 7 h) : tant que la diligence n'est pas terminée, l'avocat assigné (ou, à défaut, l'avocat du dossier) est prévenu à J-7, J-3, J-1 et le jour même, puis **chaque jour** si elle est en retard.
- Chaque **action créée dans un dossier** (workflow du dossier) crée automatiquement une diligence liée (priorité, responsable et échéance repris de l'action) et la maintient synchronisée avec l'action : en cours, terminée ou annulée.
- La procédure en cours du dossier (étape, sous-étape) est rattachée automatiquement.

## Erreurs fréquentes
- « La date limite doit être postérieure à la date de début. »
- « Dossier avec ID … non trouvé » / « Avocat avec ID … non trouvé ».
- Les boutons Ajouter un finding, Associer un document, Générer rapport, Marquer terminée dépendent de permissions distinctes.

## Créer depuis le chat
« Crée une diligence "Audit conformité Société X" sur le dossier DOS-2026-0039, échéance le 30 juin 2026, priorité haute. » Dossier, titre et échéance suffisent : la date de début est aujourd'hui, le type « Acquisition », la priorité « Moyenne », et la mission est confidentielle par défaut. Une carte de confirmation modifiable s'affiche avant l'enregistrement.
