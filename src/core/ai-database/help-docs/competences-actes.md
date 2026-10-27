---
id: competences-actes
title: Compétences « Calculs & actes » (délais de procédure, décompte de créance, injonction de payer, convention d'honoraires)
keywords: calculer un delai, delai de procedure, delai d'opposition, delai d'appel, delai de pourvoi, delai de cassation, delai franc, dernier jour utile, delais ohada, aupsrve, saisie-attribution delai, contestation de saisie, decompte de creance, calcul des interets, interets moratoires, imputation des acomptes, requete en injonction de payer, injonction de payer, requete aux fins d'injonction de payer, rediger une convention d'honoraires, convention d'honoraires a signer, convention d'honoraires depuis le chat, lettre de mission honoraires
paths: /chat
---

# Compétences « Calculs & actes »

## Calculer un délai de procédure
- Décrivez l'acte et sa date : « ordonnance d'injonction de payer signifiée le 03/10/2026 », « saisie-attribution dénoncée le 12/09/2026 », « jugement civil signifié le 10/10/2026 ». Une décision jointe peut servir de source. Mentionnez le **@dossier** pour créer les diligences.
- L'IA choisit la règle et lit la date ; **le calcul est fait par le logiciel**, jamais par le modèle.
- Règles OHADA intégrées (délais francs, AUPSRVE art. 335 : ni le jour de départ ni le jour du terme ne comptent) :

| Délai | Durée | Départ | Base |
|---|---|---|---|
| Signification de l'ordonnance d'injonction de payer | 3 mois | date de l'ordonnance | AUPSRVE, art. 7 |
| Opposition à l'injonction de payer | 15 jours | signification | AUPSRVE, art. 10 |
| Demande de formule exécutoire | 2 mois | expiration du délai d'opposition | AUPSRVE, art. 17 |
| Appel de la décision sur opposition | 30 jours | date de la décision | AUPSRVE, art. 15 |
| Commandement avant saisie-vente | 8 jours | signification du commandement | AUPSRVE, art. 92 |
| Titre exécutoire après saisie conservatoire | 1 mois | saisie | AUPSRVE, art. 61 |
| Dénonciation de la saisie-attribution | 8 jours | saisie | AUPSRVE, art. 160 |
| Contestation de la saisie-attribution | 1 mois | dénonciation | AUPSRVE, art. 170 |
| Pourvoi devant la CCJA | 2 mois | signification | Règlement de procédure CCJA, art. 28 |

- Règles nationales **à vérifier** selon la matière et la juridiction (signalées ⚠️) : appel civil ou commercial (3 mois après signification), appel social (15 jours après le prononcé), appel pénal (10 jours après le prononcé), pourvoi devant la Cour suprême (30 jours après signification). Un délai sans règle connue peut être proposé par l'IA avec son fondement : il est toujours marqué « à vérifier ».
- Résultat : tableau (délai, point de départ, **dernier jour**, jours restants, base légale). La date affichée est la plus prudente : aucun report pour jour férié n'est appliqué (le délai peut être prorogé au premier jour ouvrable suivant).
- Avec un dossier, la carte propose une **diligence « … — avant le JJ/MM/AAAA »** par délai à venir (priorité critique) ; un délai expiré ou sans date ne crée rien.

## Décompte de créance
- Indiquez le principal, la date de départ des intérêts, le taux annuel (légal ou contractuel) et, le cas échéant, les acomptes et les frais : « 2 500 000 FCFA dus depuis le 15/03/2026, taux 5 %, acompte de 500 000 le 10/06 ». Avec une **@facture**, son montant TTC, son échéance et ses paiements validés servent de base.
- Calcul par le logiciel : **intérêts simples** (base 365 jours, ou 360 si vous le demandez) jusqu'à la date d'arrêté (aujourd'hui par défaut) ; les acomptes s'imputent **d'abord sur les intérêts échus, puis sur le capital**. Sans taux indiqué, aucun intérêt n'est calculé (le taux n'est jamais deviné).
- Résultat : tableau Principal / Intérêts / Acomptes / Frais / **Total dû**, détail des périodes et des imputations, en PDF « Décompte de créance ». Étape suivante : **Rédiger la requête en injonction de payer** (le décompte est repris tel quel).

## Requête en injonction de payer
- Mentionnez le dossier, la facture ou le client, et précisez la juridiction (ex. « TPI de Douala-Bonanjo »). Idéalement, lancez-la depuis un décompte.
- L'IA rédige une requête conforme à l'**article 4 AUPSRVE** : identité complète des parties, montant avec décompte, fondement de la créance, pièces justificatives, élection de domicile si nécessaire. La créance doit être certaine, liquide et exigible, d'origine contractuelle (ou un effet de commerce, un chèque sans provision).
- Les informations inconnues (domicile, profession…) sont listées **« À compléter »**, jamais inventées. Carte Document : Juridiction, Parties, Corps de la requête (exposé des faits, fondement, décompte, PAR CES MOTIFS, pièces jointes) ; PDF au format acte.
- Conseil : passez ensuite la requête par **Contrôler les mentions d'un acte**.

## Convention d'honoraires
- Mentionnez le **@dossier** (obligatoire) ; ajoutez vos précisions (provision, échéancier, honoraire de résultat).
- Les montants viennent **uniquement** du profil de facturation du dossier (forfait, taux horaire, pourcentage, frais d'ouverture, honoraire de résultat, TVA, refacturation des frais et débours) ; sans profil, ils sont « à convenir ». La fourchette des dossiers comparables est indicative.
- Articles : objet de la mission, honoraires, provision, frais et débours, modalités de paiement, durée et fin de la mission, règlement des différends. PDF avec double signature (le client, l'avocat, « Lu et approuvé »). Droit requis : consulter les dossiers.
