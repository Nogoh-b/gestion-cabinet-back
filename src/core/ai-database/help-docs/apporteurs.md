---
id: apporteurs
title: Apporteurs d'affaires et commissions
keywords: apporteur, apporteurs, apporteur d'affaires, apporteurs d'affaires, nouvel apporteur, creer un apporteur, assigner un apporteur, apport de dossier, apports de dossiers, commission, commissions, commission d'apporteur, commissions d'apporteurs, calculer une commission, approuver une commission, commission payee, taux de commission, montant fixe, base de calcul, rapporteur, parrainage, recommandation de client, un apporteur
paths: /referrers, /dossier-referrals, /referral-commissions
---

# Apporteurs d'affaires et commissions

## À quoi ça sert
Un **apporteur d'affaires** est une personne ou une structure (confrère, expert-comptable, agence, ancien client, employé…) qui **recommande des clients** au cabinet. Le module permet d'enregistrer les apporteurs, de relier chacun à un **dossier apporté** avec les conditions de rémunération, puis de **calculer, approuver et payer les commissions** correspondantes.

## Où le trouver
Menu **Plus > Finances > Apporteurs** (`/referrers`, permission « voir les apporteurs »), avec deux raccourcis :
- **Apports de dossiers** (`/dossier-referrals`) : quel dossier a été apporté par qui, avec quelles conditions. Bouton **Assigner un apporteur**.
- **Commissions** (`/referral-commissions`) : les commissions à payer. Bouton **Calculer une commission**.
- La page principale « Apporteurs d'affaires » liste les apporteurs ; bouton **Nouvel apporteur**.
- Dans la fiche d'un dossier, un bloc **Apporteur** rappelle l'apporteur et ses conditions. Le taux, le montant et le cumul des commissions ne sont visibles qu'avec la permission de voir les commissions d'apporteurs.

## Prérequis
- Pour une commission : un **dossier**, un **apporteur**, et une **facture** (ou un **paiement**) sur ce dossier.
- Un **taux de commission** (en %) ou un **montant fixe**, défini sur l'apporteur (taux par défaut) ou sur l'apport.

## Créer un apporteur — pas à pas
1. **Apporteurs > Nouvel apporteur**.
2. **Raison sociale / Nom** (obligatoire), **Type d'apporteur** (obligatoire : Confrère, Expert-comptable, Agence, Client, Employé, Particulier, Autre). Cochez **Apporteur interne** pour un employé du cabinet (choix de l'**Employé**) ; pour le type Client, choisissez le **Client existant**.
3. **Contact** : **Nom du contact**, **Email**, **Téléphone**, **Adresse**.
4. **Rémunération** : **Taux de commission (%)** par défaut (0 à 100), **Mode de paiement** (Virement, Chèque, Espèces, Mobile Money) ; pour un virement : **Banque**, **Titulaire du compte**, **IBAN**.
5. **Notes**, puis enregistrez. Un **code** (REF-…) est attribué automatiquement.
Sur la fiche d'un apporteur : **Modifier**, **Exporter**, **Contacter par email**, **Appeler**, **Voir les dossiers apportés**, **Voir les commissions**, **Désactiver / Activer**, **Supprimer**.

## Relier un apporteur à un dossier (apport de dossier)
1. **Apports de dossiers > Assigner un apporteur** (ou depuis l'ouverture du dossier).
2. Champs : **Dossier** (obligatoire), **Apporteur** (obligatoire), **Mode de commission** (**Pourcentage** ou **Montant fixe**), **Taux de commission (%)** ou **Montant fixe**, **Base de calcul** (Facturé HT, Facturé TTC, Encaissé HT, Encaissé TTC), **Date d'apport**, **Conditions particulières**.
3. **Règles** : un dossier n'a qu'**un seul apporteur** (« Ce dossier a déjà un apporteur »). En mode pourcentage, le taux est obligatoire (celui de l'apporteur est repris à défaut) et compris entre 0 et 100 ; en mode montant fixe, le montant doit être supérieur à 0.

## Les commissions
- **Calcul automatique** : 
  - base **Facturé HT / TTC** → une commission est créée dès qu'une facture du dossier est **envoyée** ;
  - base **Encaissé HT / TTC** → une commission est créée à chaque **paiement validé** (pour « Encaissé HT », la TVA de la facture est retirée du montant payé) ;
  - en **montant fixe**, une seule commission est générée pour l'apport.
  Une même facture ou un même paiement ne génère jamais deux commissions.
- **Calcul manuel** : **Commissions > Calculer une commission** — Apport de dossier (obligatoire), Facture source, Paiement source, **Montant de la commission** (obligatoire), **Date de calcul** (obligatoire), Statut, Notes.
- **Statuts et circuit** : **Calculée** → **Approuver** → **Marquer payée** (confirmation à chaque étape). **Annuler** reste possible tant que la commission n'est pas payée (« Cette action est irréversible ») ; une commission payée ne peut plus être annulée. **Modifier**, **Exporter** et **Supprimer** sont aussi proposés.
- Seule une commission **Calculée** peut être approuvée ; seule une commission **Approuvée** peut être payée.

## Automatismes
- Facture envoyée ou paiement validé → commission calculée automatiquement (statut Calculée).
- **Marquer payée** → l'**écriture comptable** de la commission est générée en comptabilité.

## Erreurs fréquentes
- « Ce dossier a déjà un apporteur. »
- « Le taux de commission est requis (aucun taux par défaut défini pour cet apporteur). »
- « Le taux de commission doit être compris entre 0 et 100. » / « Le montant fixe de commission est requis et doit être supérieur à 0. »
- « Seules les commissions calculées peuvent être approuvées. » / « Seules les commissions approuvées peuvent être payées. » / « Une commission déjà payée ne peut pas être annulée. »
- Aucune commission générée → le dossier n'a pas d'apporteur, ou la base de calcul ne correspond pas à l'événement (une base « Encaissé » n'est pas déclenchée par l'envoi d'une facture).
- Champs de commission invisibles → permissions financières manquantes.

## Créer depuis le chat
« Crée l'apporteur Cabinet Mbarga, type confrère, taux 10 %. » ou « Assigne l'apporteur Cabinet Mbarga au dossier DOS-2026-0039, taux 10 %, base encaissé HT. » Le dossier et l'apporteur sont obligatoires ; le taux est demandé en mode pourcentage ; la date d'apport est aujourd'hui par défaut. Une carte de confirmation modifiable s'affiche avant l'enregistrement.
