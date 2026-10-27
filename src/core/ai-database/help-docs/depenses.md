---
id: depenses
title: Dépenses (factures fournisseur, notes de frais, frais et débours)
keywords: depense, depenses, gestion des depenses, nouvelle depense, note de frais, notes de frais, facture fournisseur, factures fournisseur, fournisseur, fournisseurs, debours, frais refacturable, frais refacturables, ligne de depense, lignes de depenses, justificatif, rembourser, remboursement, depense interne, frais de dossier, refacturer, enregistrer a valider, rendre facturable, expense, derogation, sans justificatif
paths: /expenses, /expense-reports, /expense-lines, /supplier-invoices, /suppliers
---

# Dépenses

## À quoi ça sert
Le module Dépenses réunit **dans une seule liste** tout ce que le cabinet dépense :
- les **factures fournisseur** (loyer, internet, logiciel, huissier…) ;
- les **notes de frais** des collaborateurs (déplacements, repas, fournitures…) ;
- les **frais de dossier** refacturables au client ;
- les **débours** avancés pour le compte du client (greffe, huissier, expert…).

Une dépense peut rester une simple charge du cabinet, ou être **rattachée à un dossier** pour être **refacturée** : après approbation, elle devient automatiquement un **élément facturable** au coût réel (voir « Éléments facturables »). Ses écritures comptables sont générées automatiquement.

## Où le trouver
- Menu **Gestion des dépenses** (`/expenses`, permission « voir les dépenses », module Dépenses inclus dans le plan d'abonnement).
- Dans Plus > Finances > **Dépenses** : **Fournisseurs**, **Factures fournisseurs**, **Notes de frais**.
- Bouton **Gérer les fournisseurs** en haut de la page, et page **Lignes de dépenses** (`/expense-lines`) pour le détail ligne par ligne.
- Dans un dossier : onglet Facturation, avec les dépenses rattachées.

## La page Gestion des dépenses
- **Indicateurs** : *Total de la période*, *À valider*, *À payer / rembourser*, *Refacturable au client*.
- **Recherche** libre (libellé, tiers, dossier) et filtres : **Type de dépense** (Factures fournisseur, Notes de frais, Dépenses internes, Frais de dossier, Débours), **Statut**, **dates** de début et de fin, **Fournisseur**, **Collaborateur**, **Dossier**, **Refacturable** (refacturable / non refacturable).
- Colonnes : Date, Type, Libellé, Fournisseur ou collaborateur, Dossier, Montant HT, Montant TTC, Statut, Facturation (état de l'élément facturable lié : À vérifier, À facturer, Réservé, Facturé, Non facturable, Ajusté, ou « En validation » tant que la dépense n'est pas approuvée).

## Prérequis
- **Dépense externe** : le **fournisseur** doit exister (Fournisseurs : raison sociale, catégorie — Internet, Électricité, Loyer, Fournitures, Logiciel, Huissier, Assurance, Maintenance, Autre —, contact, e-mail, téléphone, N° TVA, adresse, agence). Il peut être créé à la volée depuis le formulaire.
- **Dépense interne** : le **collaborateur** doit exister (Gestion des employés).
- **Dépense de dossier** : le **dossier** doit exister. Le formulaire propose « Ouvrir un nouveau dossier » si introuvable. Pour la refacturation, la convention de facturation du dossier (Facturation > Paramètres de facturation) doit autoriser la refacturation des frais et/ou des débours.
- **Justificatif** : pour un débours, prévoyez le reçu (PDF, PNG ou JPEG, **5 Mo maximum**).
- Pour la comptabilisation : rien à préparer, l'exercice de l'année est créé automatiquement et les écritures sont générées à l'approbation, au paiement ou au remboursement.
- Permissions : créer une facture fournisseur ou une note de frais ; pour approuver tout de suite, valider les notes de frais (ou modifier les factures fournisseur) et, pour un dossier, gérer les éléments facturables.

## Enregistrer une dépense — pas à pas
1. Cliquez sur **Nouvelle dépense** (fenêtre « Enregistrer une dépense » : une seule saisie pour la dépense et ses lignes).
2. **Origine et affectation** :
   - **Origine** : **Interne — collaborateur** (note de frais) ou **Externe — fournisseur** (facture fournisseur).
   - **Affectation** : **Cabinet — charge interne**, **Dossier — frais refacturable**, ou **Dossier — débours pour le client**.
   - Pour une affectation Dossier : choisissez le **Dossier** (obligatoire) et, si besoin, l'**Action associée** (elle doit appartenir à ce dossier). Une action ne peut être associée qu'à une dépense de dossier.
3. **Dépense externe** (facture fournisseur) : **Fournisseur**, **Date de facture**, **Objet**, **Montant HT**, **TVA (%)** — le **TTC est calculé**. Le **numéro est généré** et l'**échéance fixée à 30 jours** automatiquement. Détails complémentaires : agence, pièce jointe (URL), notes. La TVA proposée suit celle du dossier quand il y en a un.
4. **Dépense interne** (note de frais) : **Collaborateur**, **objet**, commentaire, puis au moins **une ligne** (« Ajouter une ligne ») : **Date**, **Catégorie** (Transport, Hébergement, Repas, Huissier, Frais de justice, Fournitures de bureau, Autre, ou créée à la volée), **Description**, **Montant TTC**, **Justificatif (URL)**. Le total TTC est calculé.
5. Terminez par :
   - **Enregistrer à valider** : la dépense est créée en attente de validation (note **Soumise** / facture **Reçue**). Rien n'est encore facturable.
   - **Enregistrer et approuver** (dépense interne) ou **Enregistrer et rendre facturable** (dépense de dossier) : validation immédiate, réservée aux profils autorisés ; la dépense passe **Approuvée** et, si elle est refacturable, devient aussitôt un élément facturable.

## Circuits de validation
**Note de frais** : Brouillon → **Soumettre** → Soumise → **Approuver** (ou **Rejeter**, avec motif) → **Marquer remboursée**.
**Facture fournisseur** : Reçue → **Approuver** (ou **Contester** → En litige) → **Marquer payée** ; **Annuler** si elle ne doit pas être réglée.

## Refacturer au client : frais et débours
- Une ligne est **refacturable** si elle est cochée « Refacturable au client » **et rattachée à un dossier** (« Un dossier est obligatoire pour refacturer une dépense »).
- **Nature pour le client** : **Frais refacturé** (dépense du cabinet répercutée) ou **Débours avancé pour le client** (somme payée à un tiers pour le client).
- **Aucun élément facturable avant l'approbation.** Après approbation, la ligne crée un élément **Frais** ou **Débours** au **coût réel** (sans majoration), rattaché à l'action si indiquée.
- La politique du dossier décide : *Refacturer les frais du cabinet*, *Refacturer les débours payés pour le client*, *Exiger un justificatif pour les débours*. Un frais dont la refacturation est décochée n'est pas facturé ; un **débours sans justificatif** arrive en **À vérifier** avec le motif « justificatif obligatoire ».
- **Justificatif** : joignez le reçu à la ligne (PDF/PNG/JPEG, 5 Mo max ; un seul justificatif par ligne). Si la pièce est vraiment introuvable, un profil autorisé peut **approuver sans justificatif** avec une **dérogation** : motif obligatoire (10 caractères minimum), conservé dans le suivi.
- Les cases « Des frais/débours peuvent être associés » du catalogue d'actions ne créent **aucune** dépense : elles rappellent seulement de les saisir ici.
- Une dépense déjà **réservée ou facturée** ne peut plus être modifiée ni supprimée : il faut retirer l'élément du brouillon de facture ou passer par un ajustement/avoir.

## Automatismes comptables
- Facture fournisseur **approuvée** → écriture d'**achat**.
- Facture fournisseur **payée** → écriture de **règlement**.
- Note de frais **remboursée** → écriture de remboursement.
Les écritures générées sont verrouillées et renvoient vers la dépense d'origine.

## Erreurs fréquentes
- « Le dossier est obligatoire » / « La nature Frais ou Débours est obligatoire » → complétez l'affectation Dossier.
- « Ajoutez au moins une ligne de dépense » → une note de frais exige une ligne.
- « L'action associée n'appartient pas au dossier sélectionné ».
- « Vous ne pouvez pas approuver immédiatement cette dépense » → utilisez « Enregistrer à valider » ; un valideur approuvera ensuite.
- « Cette dépense est déjà engagée dans la facturation et ne peut plus être supprimée ».
- Module Dépenses non inclus dans le plan, ou quota mensuel de notes de frais atteint → voir Abonnement.

## Créer depuis le chat
Je peux enregistrer une note de frais, une ligne de dépense ou une facture fournisseur : « Crée une note de frais pour Sophie Martin : déplacement tribunal de Douala, 15 000 FCFA, refacturable au client sur le dossier DOS-2026-0012 », ou « Enregistre la facture fournisseur du loyer de Mars : 400 000 FCFA HT, TVA 19,25 %, fournisseur Immobilière du Wouri ». Une carte de confirmation modifiable s'affiche avant l'enregistrement.
