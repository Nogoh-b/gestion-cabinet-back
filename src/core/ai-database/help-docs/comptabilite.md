---
id: comptabilite
title: Comptabilité
keywords: comptabilite, compta, ecriture, ecritures, ecriture comptable, ecritures comptables, ecriture manuelle, nouvelle ecriture, plan comptable, compte comptable, comptes comptables, exercice, exercices, exercice comptable, cloturer un exercice, journal, journaux, balance, grand livre, compte de resultat, etat de tva, tva collectee, tva deductible, syscohada, synchronisation comptable, comptabilisation, debit, credit, od, operations diverses, ecriture de vente, extourne, contre-passation, comptabiliser
paths: /comptabilite
---

# Comptabilité

## À quoi ça sert
Le module Comptabilité tient la comptabilité du cabinet selon le plan **SYSCOHADA**. Il contient les **écritures** (journal de toutes les opérations), le **plan comptable**, les **exercices** et les **rapports** (balance, compte de résultat, état de TVA). Presque toutes les écritures sont **générées automatiquement** par les autres modules (factures, paiements, dépenses, paie) : vous n'avez en général rien à saisir.

## Où le trouver
Menu **Plus > Finances > Comptabilité** (permission « voir la comptabilité »), avec les entrées : **Écritures**, **Plan comptable**, **Exercices**, **Balance**, **Compte de résultat**, **État TVA** (permission « voir les rapports comptables ») et **Synchronisation** (permission « gérer le plan comptable »). La page d'accueil Comptabilité affiche un accès rapide ; elle signale « Aucun exercice comptable ouvert » si besoin.

## Mise en route
À la première utilisation, le système initialise le plan comptable du cabinet : comptes SYSCOHADA, journaux et exercice de l'année en cours (opération idempotente, sans risque de doublon). Chaque cabinet a son propre plan, isolé des autres. Si le cabinet avait déjà des factures ou dépenses avant d'utiliser la comptabilité, lancez **Synchronisation** une fois (voir plus bas).

## Les journaux
**Ventes** (factures clients), **Achats** (factures fournisseurs), **Caisse**, **Banque** (encaissements et décaissements), **OD** (opérations diverses : paie, notes de frais, régularisations). Les écritures automatiques choisissent le bon journal.

## Les écritures comptables
Liste filtrable par **exercice** et par **source** (facture, paiement, facture fournisseur, note de frais, fiche de paie, avance sur salaire, commission d'apport, manuel). Colonnes : Date, Libellé, Journal, Source, Débit, Crédit. Une écriture générée affiche sa source et renvoie au document d'origine. Les écritures automatiques sont **verrouillées**.

### Saisir une écriture manuelle (opération diverse)
1. **Nouvelle écriture** (bouton en haut de la liste) → fenêtre « Nouvelle écriture manuelle ».
2. Renseignez la **date**, le **journal** (OD par défaut) et un **libellé** clair.
3. Saisissez au moins deux **lignes** (**+ Ajouter une ligne**) : **Compte** (numéro, ex. 411), **Libellé ligne**, **Débit** ou **Crédit**.
4. Surveillez **Total débit** et **Total crédit** : le bouton **Enregistrer** ne s'active que lorsqu'ils sont **égaux**. Le serveur refuse sinon (« Écriture déséquilibrée »).
Règles : le journal et chaque compte doivent exister (« Compte … introuvable ») ; une écriture manuelle est **refusée dans un exercice clôturé** (« L'exercice 2025 est clôturé ») ; si l'exercice de l'année de la date n'existe pas, il est créé automatiquement. Il n'y a pas de modification d'une écriture enregistrée : pour corriger, passez une écriture de correction (OD) ou une contre-passation.

## Comment les documents deviennent des écritures (automatique)
| Événement | Écriture générée | Journal |
|---|---|---|
| **Facture envoyée** (statut Envoyée) | Débit **411** Clients (TTC) ; crédit **produits** par nature de ligne (Honoraires, Vacations, Frais, Débours, Résultat, Frais d'ouverture…) selon le mapping du cabinet, à défaut **706** ; crédit **445** TVA collectée | Ventes |
| **Annulation d'une facture déjà émise** | Extourne (contre-passation) de l'écriture de vente | Ventes |
| **Paiement validé** | Débit **512** Banque (ou **571** Caisse si espèces) ; crédit **411** Clients | Banque |
| **Facture fournisseur approuvée** | Débit compte de charge selon la catégorie du fournisseur (loyer 622, internet 626, électricité 605, fournitures 601, logiciel 626, assurance 616, maintenance 615, huissier 622, autre 628) ; débit **445** TVA déductible ; crédit **401** Fournisseurs | Achats |
| **Facture fournisseur payée** | Débit **401** ; crédit **512** | Banque |
| **Note de frais remboursée** | Débit charges selon catégorie (transport/hébergement/repas 625, huissier et frais de justice 622, fournitures 601, autre 628) ; crédit **421** Personnel | OD |
| **Bulletin de paie payé** | Débit **641** rémunération brute ; crédit **421** net, **431** cotisations, **425** récupération d'avance ; charges patronales **645** / **431** | OD |
| **Avance sur salaire versée** | Débit **425** ; crédit **512** | Banque |
| **Commission d'apport payée** | Débit **632** ; crédit **512** | Banque |

Garanties : chaque écriture est **idempotente** (rejouer un événement ne crée pas de doublon) et **équilibrée par construction**. Les écritures automatiques sont possibles même sur un exercice clôturé, la saisie manuelle non.

## Le plan comptable
Page **Plan comptable** : liste des comptes (numéro, libellé, type Actif / Passif / Charge / Produit, état Actif/Inactif), recherche par numéro ou libellé. Le premier chiffre du numéro donne la **classe** : 1 capitaux, 2 immobilisations, 3 stocks, 4 tiers (clients, fournisseurs, personnel), 5 financier, 6 charges, 7 produits. Les comptes manquants nécessaires à une écriture automatique (par exemple 425, 632) sont créés tout seuls dans les plans existants. La consultation des soldes est disponible ; on ne supprime pas un compte déjà utilisé.

## Les exercices
Page **Exercices comptables**. **Ouvrir exercice** crée l'exercice d'une **année** (du 1er janvier au 31 décembre, statut Ouvert) — un seul exercice par année (« Un exercice existe déjà pour 2026 »). **Clôturer** demande une confirmation (« Confirmer la clôture ? ») ; la clôture est **définitive** : plus de saisie manuelle dans cet exercice. Avant de clôturer, vérifiez que la balance est équilibrée et que toutes les écritures sont passées.

## Les rapports
Calculés sur l'exercice courant à partir des écritures :
- **Balance des comptes** : par compte, mouvements débit/crédit, soldes débiteur/créditeur, totaux. Elle doit être équilibrée.
- **Compte de résultat** : **Total produits** (classe 7) − **Total charges** (classe 6) = **Résultat net**.
- **État de TVA** : **TVA collectée** (compte 445, ventes), **TVA déductible** (achats), **TVA à déclarer**, avec le détail des mouvements.
Le résultat est en droits constatés : une facture émise non encore payée compte déjà dans les produits.

## Synchronisation (rattrapage)
Page **Synchronisation comptable** : « À lancer une fois, au moment de l'activation du module. » Elle affiche les documents éligibles (factures, paiements, factures fournisseurs, paiements fournisseurs, notes de frais, paie) puis **Lancer la synchronisation** génère les écritures manquantes de l'historique. Lecture seule sur les autres modules, relançable sans doublon ; le rapport indique créées / ignorées / erreurs.

## Mapping comptable des natures de facturation
Le compte de produits de chaque nature de ligne (Honoraires, Vacation, Frais, Débours, Honoraire de résultat, Frais d'ouverture, Ajustement) est lu dans la configuration du cabinet ; sans correspondance, le compte **706** est utilisé avec un avertissement dans les journaux. Il n'y a pas encore d'écran pour le paramétrer : faites-le préparer par l'équipe technique après validation de votre comptable.

## Erreurs fréquentes
- « Écriture déséquilibrée : débit ≠ crédit » → corrigez les montants.
- « Journal … introuvable » / « Compte … introuvable » → vérifiez le plan comptable.
- « L'exercice 2025 est clôturé » → une saisie manuelle n'est plus possible, passez par l'exercice en cours.
- « Aucun exercice comptable ouvert » → ouvrez l'exercice de l'année.
- Une facture n'est pas en comptabilité → elle est encore en brouillon (l'écriture naît à l'émission).
- Écritures absentes pour l'historique → lancez la Synchronisation.

## Via le chat
Je peux créer un compte, un exercice, un journal ou une écriture : « Passe une écriture OD du 15 mars 2026 : débit 627 / crédit 512 de 5 000 FCFA, libellé frais bancaires ». Une carte de confirmation modifiable s'affiche avant l'enregistrement.
