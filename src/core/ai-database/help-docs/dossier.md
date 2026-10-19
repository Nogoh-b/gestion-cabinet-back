---
id: dossier
title: Dossiers
keywords: dossier, dossiers, ouverture de dossier, ouvrir un dossier, nouveau dossier, creer un dossier, valider l'ouverture, parcours dossier, cloture du dossier, cloturer un dossier, action du dossier, actions du dossier, gestion de dossier, workflow du dossier, numero de dossier, frais d'ouverture, rouvrir un dossier, phase du dossier
paths: /dossiers
---

# Dossiers

## À quoi ça sert
Un dossier est l'affaire traitée pour un client. Il regroupe le client, l'avocat responsable, la partie adverse, la juridiction, les actions menées, les audiences, les documents, les diligences et toute la facturation. Presque tout le reste de l'application (factures, audiences, documents, éléments facturables) se rattache à un dossier.

**Processus en bref (parcours V2) :** **Ouvrir le dossier** (client, objet, date) → **Valider l'ouverture** (forfait et frais d'ouverture mis à facturer) → **Nouvelle action** → **Commencer** → **Terminer l'action** (résultat, temps, facturation) → contrôle de clôture → **Clôturer le dossier** (issue obligatoire).

## Où le trouver
- **Dossiers > Ouverture de dossier** : créer un nouveau dossier (permission « créer un dossier »).
- **Dossiers > Gestion de dossier** : liste de tous les dossiers, filtres (statut, avocat, juridiction…), puis clic sur un dossier pour ouvrir sa fiche.
- Dans la fiche : onglets Vue d'ensemble, Documents, Audiences, Finances/Facturation, Diligences, Apporteur d'affaires, Communication, Chat.
- **Dossier > Voir toutes les actions** : recherche des actions du dossier avec filtres statut, famille et détail.
- Référentiels utiles (menu Plus > Configuration > Référentiels dossiers) : Juridictions, Diligences, Types de procédure.

## Deux façons de suivre un dossier
1. **Parcours orienté actions (« V2 »)** — le mode récent. Le dossier passe par trois phases : **Ouverture → Traitement → Clôture**. On fait avancer l'affaire en créant et en terminant des **actions** (analyse, rédaction, dépôt d'acte, audience, contact client…). Chaque action terminée peut produire de la facturation et déclencher des recommandations de prochaine action.
2. **Ancien workflow** — statuts du dossier (ouvert, analyse préliminaire, amiable, contentieux, jugement, appel, cassation, exécution, clos, archivé, abandonné) et onglets Workflow/Étapes, avec des actions de l'en-tête (Engager contentieux, Engager transaction, Enregistrer jugement, Exécuter décision, Clôturer le dossier…).

L'administrateur choisit le mode dans **menu du compte > Parcours dossier** (carte « Parcours dossier orienté actions », réglage « Nouveaux dossiers en V2 »). Les nouveaux dossiers V2 commencent en phase **Ouverture** et doivent être validés avant la première action. Un dossier garde le moteur avec lequel il a été créé, sauf migration explicite.

## Prérequis
- Un **client** (on peut le créer à la volée depuis le formulaire avec « Nouveau client »).
- Un **avocat responsable** parmi les membres du cabinet (préremplis avec vous, modifiable).
- Facultatif mais recommandé : une **juridiction**, un **type de procédure**, un **apporteur d'affaires**.
- Pour la facturation du dossier : voir les documents « Configuration de la facturation », « Éléments facturables » et « Factures ».
- Pour utiliser le parcours d'actions : le catalogue d'actions (menu du compte > Parcours dossier) doit contenir des familles et des sous-actions.

## Créer un dossier — pas à pas
1. Ouvrez **Dossiers > Ouverture de dossier**.
2. **Informations essentielles** (obligatoire) :
   - **Numéro de dossier** : laissez vide, il est attribué automatiquement (format réglé dans menu du compte > Cabinet > Numérotation des dossiers, par exemple `DOS-2026-0001`).
   - **Date d'ouverture** (obligatoire).
   - **Nature / objet de l'affaire** (obligatoire), par exemple « Litige commercial, divorce, recouvrement de créance ».
   - **Client** (obligatoire) : recherchez ou créez-le avec « Nouveau client ».
   - **Partie adverse**, **Avocat responsable**, **Juridiction** (optionnelle), **Collaborateurs** (autres membres de l'équipe).
   - **Frais d'ouverture** : laissez vide pour utiliser le montant configuré du cabinet ; saisissez un montant pour ce dossier précis (il prime sur le cabinet).
3. **Facturation** (optionnelle, section dépliable) : choisissez la **Configuration initiale** — À définir plus tard, Honoraires au forfait, Honoraires horaires, ou Forfait + horaire — puis les montants (forfait, tarif horaire, tarif de vacation), la devise, la TVA, « Frais d'ouverture inclus dans le forfait » et l'honoraire de résultat. Tout reste modifiable ensuite dans la page Facturation du dossier.
4. **Prochaine audience** (optionnelle) : seulement la date si elle est connue.
5. **Documents** (optionnel) : joignez des pièces ; chacune demande un type et une note.
6. **Apporteur d'affaires** (optionnel) : choisissez l'apporteur, le mode de commission (pourcentage ou montant fixe), l'assiette de commission et la date d'apport.
7. **Informations complémentaires** : type de procédure et sous-type, avocat adverse, numéro de dossier au tribunal (RG), contact de la partie adverse, description, niveau d'urgence.
8. Cliquez sur **Ouvrir le dossier**.

Champs réellement obligatoires : **date d'ouverture, nature/objet, client**. Le reste peut être complété plus tard depuis la fiche.

## Après la création : valider l'ouverture (parcours V2)
Un dossier V2 est en phase **Ouverture** tant qu'il n'est pas validé.
1. Ouvrez le dossier (Gestion de dossier).
2. Contrôlez ses informations et, si besoin, la configuration de facturation (Facturation > Paramètres de facturation).
3. Cliquez sur **Valider l'ouverture** (libellé « Valider l'ouverture V2 » dans le bandeau d'ouverture). Le système refuse si le client ou l'objet manque (« Ouverture incomplète »).

Ce qui se passe à la validation :
- Le dossier passe en phase **Traitement** et sur le moteur d'actions.
- Les **frais d'ouverture** deviennent un élément facturable (sauf montant nul, ou frais inclus dans le forfait), et, en mode forfait ou mixte, le **forfait principal** devient aussi un élément facturable (« Forfait principal du dossier »). Ces éléments sont facturés automatiquement dans des **factures brouillon** — rien n'est envoyé au client.
- En mode **horaire**, aucun forfait n'est créé : la facturation naît des actions terminées.
- Le moteur de recommandation propose la première action à mener.
- Rejouer la validation ne crée pas de doublon.

## Gérer les actions du dossier (parcours V2)
Dans la fiche du dossier :
1. **Nouvelle action** : choisissez la **famille d'action**, la **sous-action**, le **responsable**, la **priorité** et l'**échéance** (le rappel doit être futur et avant l'échéance), puis **Ajouter l'action**. Une action apparaît aussi sous forme de **recommandation** : « Commencer » ou « Reporter » directement depuis la suggestion.
2. Dans **Actions en cours**, cliquez sur **Commencer** quand le travail démarre (statut En cours).
3. **Terminer l'action** : indiquez le **Résultat** (obligatoire, parmi ceux autorisés par la sous-action), le **Temps passé** en minutes, les réponses spécifiques et le compte rendu, puis liez les documents et audiences produits. La zone **Facturation** de la fenêtre propose le traitement financier (voir « Éléments facturables »). Le bouton **Terminer** enregistre.
4. Autres opérations sur une action : **Suspendre** (mise en attente), **Annuler l'action**, **Prolonger l'échéance** (ou **Fixer l'échéance** si aucune n'est posée ; l'historique des échéances est conservé), **Ajouter un frais** et **Ajouter un débours** rattachés à l'action.

Statuts d'une action : À faire, En cours, En attente, Terminée, Annulée.

Contrôles à connaître :
- Seule une action **en cours** peut être terminée.
- Une action qui écrit dans une audience (rapport d'audience) exige **une seule audience liée** et un rapport ; reporter une audience exige le **motif** ainsi que la **nouvelle date et heure**.
- Les documents et audiences liés doivent appartenir au dossier ; un document confidentiel ne peut pas être lié librement.
- Si quelqu'un d'autre a modifié l'action entre-temps : « Cette action a été modifiée. Rechargez le dossier. »

## Clôturer un dossier (parcours V2)
1. Lancez le **contrôle de clôture**. Il liste :
   - des **bloquants** (clôture impossible) : actions obligatoires encore ouvertes, audiences planifiées ou reportées non traitées, migration du dossier incomplète, dossier pas encore sur le parcours V2 ;
   - des **avertissements** (clôture possible avec justification) : éléments encore à facturer ou à revoir, factures impayées, pièces encore attendues, aucun document final identifié.
2. Renseignez l'**issue du dossier** (Gagné, Perdu, Accord amiable, Abandonné…) — obligatoire —, les notes de clôture, la satisfaction du client.
3. S'il reste des avertissements, saisissez la **justification des avertissements** (obligatoire dans ce cas).
4. Validez : le dossier passe en phase **Clôture**, les recommandations en cours sont écartées, et un récapitulatif de clôture (actions, éléments facturables, factures et paiements) peut être généré en PDF et archivé dans le dossier.
Le bouton **Clôturer le dossier** se trouve dans la gestion du dossier ; sur un dossier clôturé il devient **Rouvrir le dossier**.

## Automatismes
- À l'émission d'une facture du dossier, si un apporteur est lié : la commission d'apport est calculée.
- Facture envoyée et paiements : les écritures comptables sont générées automatiquement (voir « Comptabilité »).
- La création d'un dossier crée sa conversation interne (onglet Chat) et notifie l'équipe.

## Erreurs fréquentes
- « Ouverture incomplète : client, objet » → complétez ces champs puis revalidez.
- « Le dossier ne peut pas être clôturé » → traitez les bloquants listés.
- « Une justification est requise pour accepter les avertissements » → saisissez la justification.
- « L'issue du dossier est obligatoire pour la clôture » → choisissez une issue autre que « Non renseignée ».
- Bouton d'action absent → vérifiez le rôle (permissions) et les fonctionnalités du plan d'abonnement.

## Créer un dossier depuis le chat
Vous pouvez me demander de créer le dossier en une phrase : « Ouvre un dossier pour le client Jean Dupont, avocat responsable Maître Ngono, procédure Contentieux civil, objet litige commercial pour 3 500 000 FCFA, tribunal de première instance de Douala, urgence élevée. » Le client, l'avocat, la procédure et la juridiction se donnent par leur nom ; le numéro de dossier est généré tout seul. Un client inconnu peut être créé à la volée. Une carte de confirmation modifiable s'affiche avant l'enregistrement.
