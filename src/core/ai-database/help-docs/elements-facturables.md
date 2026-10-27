---
id: elements-facturables
title: Éléments facturables
keywords: element facturable, elements facturables, facturation des dossiers, a facturer, honoraire de resultat, honoraires de resultat, valider un honoraire, ajustement, avoir, recalculer, prestation manuelle, ajouter un element a facturer, element a determiner, a determiner, ne pas facturer, retirer de la facturation, vacation, debours, frais refacturables, forfait principal, billable, reserve a facturer, renseigner le tarif, valider le tarif
paths: /facturation/elements-facturables, /dossiers/
---

# Éléments facturables

## À quoi ça sert
Un **élément facturable** est une ligne de la réserve « **À facturer** » : elle dit *qu'est-ce qu'on pourra facturer, combien, et pourquoi*. Ce n'est **pas encore une facture**. Les factures sont ensuite construites uniquement à partir de ces éléments, ce qui garde toujours l'origine de chaque montant et empêche la double facturation.

Règle centrale : **une action produit au maximum une seule rémunération professionnelle** (un honoraire *ou* une vacation). La même action peut en revanche être reliée à plusieurs **frais** et **débours**, saisis séparément dans les dépenses.

## Où les voir
- **Dossier > Facturation** : situation financière du dossier (à facturer, facturé, encaissé, reste à payer), sélection des éléments, factures.
- **Plus > Finances > Facturation des dossiers** (menu « Gestion de facture ») : les éléments de **tous** les dossiers, avec filtres **État**, **Origine**, **Catégorie**, **Dossier**, **Client**, **Depuis le / Jusqu'au**.

## Comment un élément est créé (automatiquement)
| Événement | Élément créé |
|---|---|
| **Validation de l'ouverture** du dossier | **Frais d'ouverture du dossier** (si activés, montant > 0 et non inclus dans le forfait) et, en mode forfait ou mixte, **Forfait principal du dossier** |
| **Action terminée** | Honoraire au temps passé (durée/60 × taux), vacation (quantité × tarif), ou rien si « incluse dans le forfait » / « non facturable » ; « À déterminer » si tarif/durée manquant ou décision « à vérifier » |
| **Audience tenue / créée, diligence terminée** | Selon les règles de facturation automatique du dossier |
| **Note de frais approuvée** (ligne refacturable rattachée au dossier) | Frais ou débours au **coût réel**, sans majoration |
| **Honoraire de résultat validé** | Honoraire de résultat en pourcentage |
| **Saisie manuelle** | Prestation exceptionnelle |
| **Ajustement** | Correction après facturation |

Chaque événement a une clé unique : rejouer, actualiser ou rouvrir une page **ne crée jamais de doublon**.

### Décision financière d'une action (à la clôture de l'action)
Dans la fenêtre « Terminer l'action », la zone **Facturation** propose (modifiable avec **Modifier**) :
- **Honoraire au temps passé**, **Vacation**,
- **Incluse dans le forfait** (le temps est conservé, aucun supplément),
- **Non facturable**,
- **À vérifier** (crée un élément « À déterminer » de montant 0).
Par défaut, la décision découle de la sous-action du catalogue et du mode du dossier (voir « Configuration de la facturation »).

## États d'un élément
| État | Signification |
|---|---|
| **À déterminer** | Il manque une information (tarif, durée, justificatif de débours…) ; bloqué tant qu'il n'est pas validé |
| **À facturer** | Prêt à être mis sur une facture |
| **Réservé** | En cours de mise en facture |
| **Facturé** | Déjà sur une facture ; figé |
| **Abandonné** | Retiré de la facturation, motif conservé |
| **Ajusté** | Corrigé par un ajustement |

## Catégories
**Frais d'ouverture, Honoraires, Vacation, Frais, Débours, Honoraire de résultat, Ajustement.** Elles servent au regroupement sur la facture et à la ventilation comptable.

## Opérations courantes

### Valider le tarif d'un élément « À déterminer »
Page Finances > Facturation des dossiers, filtre État « À déterminer » → menu de la ligne → **Renseigner le tarif** (ou **Valider le tarif**) → quantité, prix unitaire, TVA → valider : la ligne passe à **À facturer**.

### Ajouter un élément à la main
Dossier > Facturation > **Ajouter un élément à facturer** (« Ajouter un élément ») : choisissez la catégorie (**Honoraires** ou **Vacation**), le libellé, l'origine (**Prestation manuelle** ou **Diligence**), la date, la quantité, le prix unitaire et la TVA. Les catégories Frais et Débours sont **refusées ici** : elles viennent obligatoirement des notes de frais.

### Valider un honoraire de résultat
Dossier > Facturation > **Actions** > **Valider un honoraire de résultat** : le **taux conventionné** (profil du dossier) est affiché ; saisissez la **base obtenue (montant)** et la **référence du résultat** (date et note facultatives). Une estimation s'affiche, puis **Valider**. Valider à nouveau avant facturation met à jour la même ligne.
Condition : l'honoraire de résultat est complémentaire — il est **refusé s'il est la seule rémunération** (« L'honoraire de résultat ne peut pas être la seule rémunération professionnelle »).

### Retirer un élément de la facturation
Menu de la ligne (Plus d'actions) > **Ne pas facturer** / **Retirer de la facturation** → saisissez le **motif** (« Pris en charge par le cabinet »…) → l'élément passe **Abandonné** et n'est plus proposé.

### Recalculer les éléments ouverts
Dossier > Facturation > **Recalculer les éléments ouverts** : après un changement de tarif, un **aperçu avant/après** s'affiche, puis **Appliquer le recalcul**. Seuls les éléments ouverts (non réservés, non facturés) changent.

### Créer une facture
Sélectionnez des éléments **À facturer** (même dossier, même devise) → **Créer la facture** / **Facturer la sélection** → renseignez dates et description. Voir « Factures ».

### Corriger après facturation : ajustement puis avoir
Un élément **Facturé** ne se modifie jamais. Filtrez l'état « Facturé », menu de la ligne > **Créer un ajustement**, saisissez un montant (**négatif** pour préparer un avoir), la TVA et le motif. Puis sélectionnez uniquement l'ajustement et **Créer la facture** : le système génère un **avoir** relié à la facture d'origine. Les ajustements se facturent **séparément** des prestations normales et doivent concerner une seule facture d'origine.

## Frais et débours
- Une dépense n'alimente la facturation qu'**après approbation** de sa note de frais, si elle est rattachée au dossier et marquée **refacturable**, et si la politique du dossier l'autorise (profil : Refacturer les frais / les débours).
- Un **débours** sans justificatif (quand le profil l'exige) arrive en **À déterminer** avec le motif « justificatif obligatoire ».
- Les cases « frais/débours possibles » du catalogue n'ajoutent rien automatiquement.
- Modifier une dépense déjà réservée ou facturée est bloqué : il faut retirer l'élément du brouillon ou passer par un ajustement/avoir.

## Pourquoi l'élément n'apparaît pas ?
- Action non terminée ou décision « Incluse dans le forfait » / « Non facturable ».
- Dossier en mode horaire : aucun forfait n'est créé à l'ouverture.
- Dépense non approuvée, non refacturable, ou politique de refacturation décochée.
- Fonctionnalité de facturation non incluse dans le plan d'abonnement, ou permission manquante (voir les éléments : « voir les éléments facturables » ; modifier : « gérer les éléments facturables » ; créer une facture : « générer une facture depuis les éléments » et « créer une facture »).

## Pièges à connaître
- Une règle automatique « Action terminée » **et** une règle « Audience tenue » peuvent compter deux fois le même travail : n'en gardez qu'une.
- Une règle unitaire (vacation) doit rester classée **Vacation**, pas Honoraires.
- Honoraire horaire et vacation sur la même période : à éviter sauf clause explicite.
