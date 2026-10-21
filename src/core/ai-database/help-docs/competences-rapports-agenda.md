---
id: competences-rapports-agenda
title: Compétences « Rapports & exports » et « Agenda & tâches »
keywords: rapport d'activite depuis le chat, bilan du mois, rapport du mois dernier, periode du rapport, etat des impayes, factures impayees chat, relancer depuis l'etat des impayes, exporter un dossier, export zip du dossier, telecharger le zip, compte rendu d'audience, compte rendu au client, publier le compte rendu, programmer une audience depuis le chat, reporter une audience, reporter une audience depuis le chat, reporter une audience avec le chat, renvoi d'audience, creer une diligence depuis le chat, enregistrer un paiement depuis le chat
paths: /chat
---

# Compétences « Rapports & exports » et « Agenda & tâches »

## Rapport d'activité
- Précisez la période : « septembre 2026 », « le mois dernier », « cette semaine », « ce trimestre », « le trimestre dernier », « cette année », « 2025 », « du 01/09/2026 au 15/09/2026 ». Par défaut : le mois en cours jusqu'à aujourd'hui.
- Résultat : dossiers ouverts et clôturés, taux de succès, audiences tenues / programmées, taux de renvoi, facturé, encaissé (taux de recouvrement), reste à encaisser, diligences terminées / en retard, documents reçus / à valider, principaux clients facturés, juridictions les plus sollicitées, plus 2 ou 3 phrases d'analyse. Étape suivante : **En faire un document PDF**.
- Droit requis : consulter les rapports ; module **Rapports** du plan (sinon la compétence n'apparaît pas).

## État des impayés
- Pour tout le cabinet, ou mentionnez un **@client** ou un **@dossier**. Ouvert depuis une fiche dossier, l'état porte sur ce dossier ; « l'état des impayés **du cabinet** » (ou « de tout le cabinet », « global ») porte sur tout le cabinet, même depuis une fiche.
- Un **graphique** montre le reste dû des dossiers qui doivent le plus (barres, courbe ou camembert ; image PNG et copie des données).
- Résultat : total restant dû, nombre de factures en retard, tableau (facture, client, dossier, échéance, reste dû, retard en jours) avec liens ; seuls les paiements validés sont déduits. Étapes suivantes : **Relancer** les trois dossiers qui doivent le plus.
- Droit requis : consulter les factures.

## Exporter un dossier (ZIP)
- Mentionnez le **@dossier** : bouton **Télécharger le ZIP** (documents, factures et paiements, selon vos droits — même export que la fiche dossier). Droit requis : consulter les dossiers.

## Compte rendu d'audience
- Mentionnez l'**@audience** (ou le dossier : sa dernière audience passée est retenue) et ajoutez vos notes.
- L'IA rédige un compte rendu destiné au client : déroulement, décision ou renvoi, prochaines étapes ; le procès-verbal saisi sur l'audience est utilisé s'il existe. Une décision inconnue n'est jamais inventée.
- Étapes suivantes : **Envoyer au client par e-mail**, **Publier dans l'espace client**. Droit requis : consulter les audiences.

## Programmer une audience
- Mentionnez le **@dossier** et donnez date, heure, juridiction, salle : « audience le 12/11 à 9 h au TPI de Douala, salle 3 ». L'IA prépare la création de l'audience ; la carte de confirmation est modifiable (listes de juridictions, types…). Droit requis : créer une audience.

## Reporter une audience
- Mentionnez l'**@audience** et la nouvelle date (et l'heure si elle change), éventuellement le motif et la salle.
- Même report que la fiche audience : l'audience actuelle passe « reportée » et une **nouvelle audience** est créée à la nouvelle date (historique conservé). Sans date lisible, la compétence la demande. Droit requis : reporter une audience.

## Créer une diligence
- Mentionnez le **@dossier** (et le collaborateur responsable si besoin) avec l'objet et l'échéance : « déposer les conclusions avant le 30/11 ». Carte de confirmation modifiable. Droit requis : créer une diligence.

## Enregistrer un paiement
- Mentionnez la **@facture** avec le montant, le mode et la date : « 500 000 FCFA reçus par virement aujourd'hui ». Carte de confirmation modifiable. Droit requis : enregistrer un paiement.
- Sans « # » : une phrase d'encaissement avec un montant et sa devise ou un moyen de paiement (« 1000 FCFA reçus par virement sur @FAC-… », « acompte reçu par chèque sur la facture … ») lance cette compétence. Une question (« la facture a-t-elle été payée ? ») reste une lecture.
