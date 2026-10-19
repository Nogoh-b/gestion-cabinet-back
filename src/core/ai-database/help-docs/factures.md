---
id: factures
title: Factures et paiements
keywords: facture, factures, facturer, creer une facture, nouvelle facture, emettre une facture, envoyer une facture, marquer envoyee, avoir, paiement, paiements, nouveau paiement, enregistrer un paiement, encaisser, encaissement, relancer, relance, solde, reste a payer, facture impayee, facture brouillon, numero de facture, annuler une facture, pdf facture, statut de la facture, facture partiellement payee
paths: /facturation/factures, /finances
---

# Factures et paiements

## À quoi ça sert
Une **facture** est le document adressé au client pour un dossier. Elle est construite à partir des **éléments facturables** du dossier (honoraires, vacations, frais, débours, frais d'ouverture, résultat), ou saisie à la main. Les **paiements** s'enregistrent ensuite sur la facture, qui change automatiquement de statut.

**Processus en bref :** éléments **À facturer** sélectionnés (même dossier, même devise) → **Créer une facture** (brouillon, numéro automatique) → **Marquer envoyée** ou **Envoyer par email** (écriture de vente + commission d'apport) → **Nouveau paiement** jusqu'au solde (**Payée**, écriture d'encaissement).

## Où la trouver
- **Plus > Finances > Facturation des dossiers > Factures** : toutes les factures (permission « voir les factures »).
- **Dossier > Facturation** : les factures du dossier avec paiements, indicateurs et relance.
- Types de facture : Plus > Configuration > **Types de facture**.
- Numérotation et TVA par défaut : menu du compte > **Cabinet**.

## Prérequis
- Un **dossier** (et donc son client).
- Des **éléments facturables « À facturer »** pour la voie normale (voir « Éléments facturables »), ou le montant HT à saisir pour une facture manuelle.
- Des **types de facture** configurés (TVA, délai de paiement).
- Côté comptabilité, rien à préparer : l'exercice de l'année de la facture est créé automatiquement s'il manque (voir « Comptabilité »).
- L'adresse e-mail du client pour l'envoi par courriel.

## Types et statuts
- **Types** : Honoraires, Frais de procédure, Diligences, Autres, **Avoir**.
- **Statuts** : **Brouillon**, **Envoyée**, **Partiellement payée**, **Payée**, **Impayée**, **Annulée**.

## Créer une facture — voie normale (depuis les éléments)
1. **Dossier > Facturation** (ou Finances > Facturation des dossiers).
2. Dans **À facturer**, cochez les éléments à mettre sur cette facture. Le nombre et le total sélectionnés s'affichent. Tous les éléments doivent appartenir au **même dossier** et avoir la **même devise**.
3. Cliquez sur **Créer une facture** (**Facturer la sélection**).
4. Dans **Informations essentielles** : date de facturation (aujourd'hui par défaut), **échéance** (30 jours par défaut), description, TVA éventuelle.
5. Créez : une facture **Brouillon** est générée avec son numéro automatique ; les éléments sélectionnés passent **Facturé**, les autres restent **À facturer**.
6. Sur la facture, la section **Éléments facturés** regroupe les lignes par nature : Honoraires, Vacations, Frais, Débours, Honoraire de résultat, Frais d'ouverture.
7. Possibilité d'enregistrer un **encaissement initial** (paiement) en même temps que la facture ; le montant ne peut pas dépasser le TTC.

À la validation de l'ouverture d'un dossier, le forfait et les frais d'ouverture sont déjà facturés automatiquement en brouillon.

## Créer une facture — saisie manuelle
Création d'une facture depuis la liste ou le dossier : **Dossier** (obligatoire), **Type de facture**, **Date de facturation**, **Date d'échéance**, **Montant HT** (la TVA et le TTC en découlent), description/libellé. Le **numéro** se laisse **vide** : il est généré automatiquement. L'option « Notifier le client par e-mail » envoie la facture à l'émission.

## Émettre la facture
Une facture **Brouillon** n'a aucun effet comptable. Pour l'émettre : sur la fiche, **Marquer envoyée** (bouton visible uniquement en brouillon) ou **Envoyer par email** au client (message avec numéro, dates, montant TTC et reste à payer) : l'envoi par e-mail fait **passer automatiquement un brouillon à « Envoyée »** (permission « envoyer une facture par e-mail »).
À ce moment, automatiquement :
- une **écriture de vente** est générée en comptabilité (journal Ventes) ;
- si le dossier a un **apporteur** en base « facturé », sa **commission** est calculée.

## Enregistrer un paiement
1. Fiche de la facture > onglet **Paiements** > **Nouveau paiement** (ou **Encaisser** depuis Dossier > Facturation).
2. Renseignez le **montant**, la **date**, le **mode** (virement, chèque, espèces, carte, prélèvement, mobile, autre), la **référence**, la banque, les notes.
3. Un paiement **validé** met à jour la facture : *Partiellement payée* tant qu'il reste un solde, *Payée* quand le TTC est soldé. Les indicateurs **Encaissé** et **Reste à payer** se mettent à jour.
4. À la validation du paiement : écriture d'**encaissement** et, si base « encaissé », commission d'apport.

Le système **refuse** : un montant nul ou négatif, un paiement qui **dépasse le reste à payer**, et tout paiement sur une facture **annulée**. Statuts de paiement : En attente, Validé, Rejeté, Annulé (seul « Validé » compte dans le payé).

## Relancer un client
Dossier > Facturation ou fiche facture > **Relancer** (« Relancer le client ») : envoi d'un rappel pour les factures qui ont un reste à payer ; un message indique si aucune relance n'est nécessaire.

## Actions de la fiche facture
Exporter, Imprimer, **Envoyer par email**, **Nouveau paiement**, Modifier, **PDF Facture** (document standard) ou PDF personnalisé (vos modèles PDF), **Export comptable**, Export client, **Archiver**, **Marquer envoyée**, Supprimer (brouillon). Onglets : Détails (montants HT/TVA/TTC, payé, reste à payer, dates, client, dossier), Paiements, Communication.

## Corriger une facture émise : avoir
Une facture émise **ne s'annule pas directement** (« Créez un avoir ou une ligne d'ajustement liée à l'original »). Procédure : créer un **ajustement** sur l'élément facturé (montant négatif), puis le facturer seul → un **Avoir** relié à la facture d'origine est généré sans toucher à l'original. Seul un **brouillon** peut être annulé.

## Questions fréquentes
- *Faut-il saisir le numéro ?* Non, il est généré (format réglé dans Cabinet > Numérotation des factures).
- *Ma facture n'apparaît pas en comptabilité.* Elle est probablement encore en brouillon : l'écriture n'est générée qu'à l'émission (statut Envoyée).
- *Je ne vois pas le bouton Créer une facture.* Il faut les permissions de création de facture et de génération depuis les éléments, et la facturation incluse dans le plan.
- *Pourquoi mon paiement est refusé ?* Montant supérieur au reste à payer, nul/négatif, ou facture annulée.
- *Comment facturer sans élément facturable ?* Création manuelle d'une facture (dossier, type, dates, montant HT).

## Créer une facture depuis le chat
« Facture le dossier DOS-2026-0012 : honoraires de 500 000 FCFA HT, TVA 19,25 %, échéance dans 30 jours. » Le dossier se donne par son numéro `DOS-…` (le client est repris du dossier), le numéro de facture est automatique, et une carte de confirmation modifiable s'affiche avant l'enregistrement. Pour enregistrer un paiement : « Enregistre un paiement de 250 000 FCFA par virement sur la facture FAC-2026-0003 ».

## Envoyer une facture ou une relance depuis le chat
« Envoie la facture FAC-2026-0003 au client », « Transmets cette facture à compta@client.com », « Relance le client du dossier DOS-2026-0001 pour ses impayés ». Le chat envoie le même e-mail que les boutons **Envoyer par email** et **Relancer** (même permission « envoyer une facture par e-mail ») et affiche **toujours** une carte de confirmation : facture ou dossier visé, destinataire (modifiable ; par défaut l'e-mail du client), nombre de factures relancées et reste dû. Rien ne part avant **Confirmer**, et un e-mail envoyé ne peut pas être rappelé. On peut enchaîner : « Facture le dossier DOS-2026-0012 (500 000 FCFA HT) et envoie-la au client » crée la facture puis l'envoie, seulement si la création a réussi.
