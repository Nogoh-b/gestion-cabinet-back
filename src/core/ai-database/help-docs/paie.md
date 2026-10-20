---
id: paie
title: Paie
keywords: paie, gestion des paies, fiche de paie, fiches de paie, bulletin de paie, bulletins de paie, bulletin, bulletins, periode de paie, periodes de paie, generer les bulletins, cloturer la periode, cloturer la paie, bareme de cotisations, cotisations, cnps, irpp, retenue, retenues, prime, commission interne, avance sur salaire, avances sur salaire, salaire brut, net a payer, marquer payee, parametres de paie, salaire de base, charges patronales, payroll, heures supplementaires
paths: /paie, /payroll, /payslip, /salary-advances
---

# Paie

## À quoi ça sert
Le module Paie prépare la paie du cabinet **mois par mois** : on crée une **période**, on **génère les bulletins** de tous les collaborateurs, on contrôle et ajuste (primes, retenues, avances), on **clôture la période** puis on **marque chaque bulletin payé**. Le paiement d'un bulletin génère automatiquement l'écriture comptable.

**Processus en bref :** collaborateurs avec salaire (Employés) → barème configuré (Paramètres de paie) → **Nouvelle période** → **Générer les bulletins** → contrôle et ajustements → **Clôturer la période** → **Marquer payée** (écriture comptable + récupération des avances).

## Où le trouver
- Menu **Gestion des paies** (section « Cabinet » de la barre latérale, `/paie`, permission « voir la paie », module Paie inclus dans le plan d'abonnement) : l'espace unique de travail.
- **Paramètres de paie** (bouton en haut de l'espace Paie) : le **barème de cotisations**.
- Onglet **Avances sur salaire** dans l'espace Paie, et onglet **Avances sur salaire** dans la fiche du collaborateur.
- Les listes détaillées existent aussi : Périodes de paie, Fiches de paie, Lignes de paie, Cotisations, Avances.

## Prérequis (à faire avant la première paie)
1. **Les collaborateurs existent, sont actifs et ont un salaire mensuel** renseigné dans leur fiche (Gestion des employés). Sans salaire (> 0), un collaborateur est **ignoré** à la génération (bouton « Configurer les salaires » de l'espace Paie).
2. **Le barème de cotisations est configuré** : Paramètres de paie > Barème de cotisations. Bouton **Installer le barème par défaut** pour partir d'un barème standard (CNPS, IRPP, etc.).
3. (Facultatif) **Une agence**, si la paie se fait par site.
4. (Comptabilité) Le plan comptable du cabinet initialisé : l'exercice de l'année est créé automatiquement et l'écriture de paie est générée sans action de votre part.

## Le cycle mensuel, pas à pas
1. **Choisir ou créer la période.** En haut de l'espace Paie, le sélecteur « Choisir une période de paie » retrouve un ancien mois. **Nouvelle période** (ou « Créer la première période ») demande : **Libellé** (ex. « Paie mars 2026 », 3 caractères minimum), **Date de début**, **Date de fin** (par défaut le mois courant), **Statut** (Brouillon au départ), **Agence** (facultative, « Toutes les agences » par défaut). Le bouton **Modifier** change la période tant qu'elle n'est pas payée. Sur la fiche d'une période, les actions sont **Voir les fiches de paie**, **Ajouter une fiche**, **Générer automatiquement** et **Clôturer la période**.
2. **Générer les bulletins** (bouton **Générer les bulletins**, seulement sur une période en **brouillon**). Pour chaque collaborateur actif ayant un salaire (et rattaché à l'agence de la période si elle est précisée), le système crée un **bulletin brouillon** avec : la ligne **Salaire de base**, les **retenues salariales** calculées d'après le barème, et, s'il existe des avances versées non remboursées, une ligne **Récupération avance sur salaire**. Les **charges patronales** sont calculées à part (hors net). Relancer la génération ne crée pas de doublon : un bulletin existant est ignoré. Le résultat indique combien de bulletins ont été créés, ignorés (déjà présents) ou sans salaire.
3. **Contrôler.** Les cartes de synthèse montrent **Salaire brut**, **Retenues**, **Net à payer** et le nombre de **Bulletins**. Ouvrez un bulletin pour voir ses **Lignes de paie**.
4. **Ajuster un bulletin brouillon.** **Ajouter un bulletin** pour un collaborateur manquant (collaborateur, période, salaire de base) — un seul bulletin par collaborateur et par période. Dans l'onglet **Lignes de paie**, ajoutez une ligne : **Type de ligne** (Salaire de base, Prime, Commission interne, Retenue, Avantage, Heures supplémentaires), **Libellé**, **Montant**, **Imposable**, **Dossier source**, **Détail du calcul**. L'action **Générer commissions** (fiche du bulletin brouillon) crée des lignes de commission interne à partir des dossiers clôturés sur la période, selon un taux.
5. **Clôturer la période** (bouton **Clôturer la période**, confirmation : « Clôturer cette période validera tous les bulletins encore en brouillon »). Tous les bulletins brouillon sont **validés** (un bulletin à salaire brut nul ou négatif échoue et est signalé), puis la période passe **Validée**. Une fois validé, un bulletin n'est plus modifiable.
6. **Payer.** Sur chaque bulletin validé (fiche du bulletin, actions **Valider**, **Marquer payée**, **Repasser en brouillon**, **Télécharger PDF**) : **Marquer payée**. Le bulletin devient **Payé** avec sa date de paiement, les avances récupérées sont imputées, et l'**écriture de paie** est générée automatiquement en comptabilité. Un bulletin ne peut pas être payé tant qu'il n'est pas validé.

## Comment le calcul est fait
- **Brut** = salaire de base + primes + commissions internes + avantages + heures supplémentaires.
- **Retenues** = cotisations salariales + récupération d'avances.
- **Net à payer** = brut − retenues. Tout est recalculé depuis les lignes : on ne saisit jamais le net à la main.
- **Base imposable** = somme des gains marqués « Imposable ».

## Statuts
- **Période** : Brouillon → Validée → Payée (ou Annulée).
- **Bulletin** : Brouillon → Validé → Payé.
- **Avance** : Demandée → Approuvée → Versée → Récupérée (ou Annulée).

## Le barème de cotisations (Paramètres de paie)
Chaque ligne du barème contient : **Code**, **Libellé**, **Taux (%) ou montant**, **Assiette** (Salaire brut, Base imposable ou Montant fixe), **Supporté par** (Salarié = retenue sur le net, Employeur = charge patronale hors net), **Plafond de l'assiette**, **Compte SYSCOHADA**, **Ordre d'application**, **Active**. Seules les cotisations actives s'appliquent, dans l'ordre indiqué ; les montants nuls sont ignorés.

## Les avances sur salaire
- **Nouvelle avance** : collaborateur, **montant** (> 0, et **pas supérieur au salaire** du collaborateur), date d'octroi, **motif**. Le collaborateur peut aussi la demander depuis son profil (« Mes demandes »).
- Circuit : **Demandée** → **Approuver** (seule une avance demandée peut l'être) → **Verser l'avance** (on peut verser directement une avance demandée ; une confirmation rappelle que l'écriture comptable 425/512 sera générée). Le versement génère l'écriture comptable (créance sur le personnel, compte 425 contre la banque).
- **Récupération automatique** : à la génération d'un bulletin, le total des avances versées non encore remboursées est retenu, **plafonné au net disponible** (retenue partielle possible, le reste est reporté aux mois suivants). L'imputation réelle sur l'avance se fait au **paiement** du bulletin ; une avance entièrement remboursée passe à **Récupérée**.
- Une avance **non versée** peut être modifiée, annulée ou refusée (avec motif) ; une avance **versée** ne peut plus être modifiée, annulée ni supprimée (impact comptable).

## Corrections
- Bulletin **validé** : utilisez **Repasser en brouillon** pour le corriger.
- Bulletin **payé** : ni modification, ni suppression, ni retour au brouillon (impact comptable).
- Période **payée** : ni modification ni suppression.

## Automatismes
- Paiement d'un bulletin → écriture de paie (journal de paie) et récupération des avances.
- Versement d'une avance → écriture 425 / 512.
- Les décisions sur les demandes (avances, permissions) notifient le collaborateur.

## Erreurs fréquentes
- « Le module Paie n'est pas inclus dans votre plan » ou quota mensuel de bulletins atteint → voir Abonnement.
- « La génération n'est possible que sur une période en brouillon. »
- « Une fiche de paie existe déjà pour ce collaborateur sur cette période. »
- « Le salaire brut doit être strictement positif pour valider. »
- « La fiche doit être validée avant paiement. » / « Fiche déjà payée. »
- « Fiche de paie validée : non modifiable. Repassez-la en brouillon d'abord. »
- « L'avance ne peut pas dépasser le salaire de l'employé. »
- Aucun bouton de gestion visible → permissions insuffisantes (un avocat a par défaut un accès en consultation).

## Exemple : la paie de mars
1. **Nouvelle période** : libellé « Paie mars 2026 », du 1er au 31 mars, statut **Brouillon**.
2. **Générer les bulletins** : 12 bulletins créés, 1 collaborateur ignoré (sans salaire — **Configurer les salaires**), avances de 2 collaborateurs reprises en retenue.
3. Contrôle : sur le bulletin de Sophie Martin, ajout d'une ligne **Prime** de 50 000 FCFA (imposable).
4. **Clôturer la période** : bulletins **Validés**, période **Validée**.
5. Sur chaque bulletin : **Marquer payée** → statut **Payé**, écriture de paie générée, avances imputées.

## Créer depuis le chat
Je peux créer une période de paie, un bulletin ou une ligne de bulletin si vous donnez les informations : « Crée la période de paie Mars 2026 du 1er au 31 mars 2026 », « Crée un bulletin de paie pour Sophie Martin sur la période Mars 2026, salaire de base 350 000 ». Une carte de confirmation modifiable s'affiche avant l'enregistrement.
