---
id: audiences
title: Audiences et agenda
keywords: demarrer l'audience, demarrer une audience, terminer l'audience, terminer une audience, audience en cours, audiences en cours, enregistrer une audience, enregistrer l'audience, enregistrement de l'audience, enregistrement audio, enregistrer le son, transcrire l'audience, transcription de l'audience, segments audio, generer un document d'audience, generer un document, proces-verbal d'audience, audience, audiences, preparer l'audience, pieces pour l'audience, documents de l'audience, ajouter des documents a une audience, modifier une audience, agenda, calendrier des audiences, nouvelle audience, planifier une audience, programmer une audience, reporter une audience, report d'audience, renvoi, renvoyer une audience, audience renvoyee, rapport d'audience, proces-verbal, decision d'audience, marquer tenue, audience tenue, annuler une audience, type d'audience, types d'audience, rappel d'audience, plaidoirie, mise en etat, juge, salle d'audience, audience de jugement, audience de conciliation, une audience
paths: /audiences
---

# Audiences et agenda

## À quoi ça sert
Une **audience** est un rendez-vous devant une juridiction lié à un dossier. Le module permet de la **planifier**, de la **reporter** (nouvelle date, heure et motif), de la **démarrer** le jour J, d'**enregistrer le son** et de le transcrire, de la **terminer**, de **générer** le rapport, le procès-verbal ou un projet de décision, d'**enregistrer la décision** rendue et de suivre le calendrier du cabinet. Un rappel automatique est envoyé aux avocats et collaborateurs du dossier.

## Où le trouver
- Menu **Agenda** (`/audiences/calendrier`, permission « voir l'agenda ») : calendrier mensuel des audiences, une pastille de couleur par statut (Planifiée, En cours, Tenue, Reportée, Annulée), navigation de mois en mois.
- **Plus > Pilotage > Audiences** (`/audiences`, permission « voir les audiences ») : la liste avec statistiques, filtres et recherche. Boutons **Nouvelle audience** et un export des audiences d'une période. Le bloc **Audiences en cours** s'affiche en tête de cette page et sur le tableau de bord dès qu'une audience est démarrée, avec un lien vers sa fiche et un bouton **Terminer**.
- Depuis un dossier : l'onglet des audiences du dossier permet de planifier une audience déjà rattachée à ce dossier.
- Fiche d'une audience (`/audiences/<id>`) : informations, bloc **Enregistrement audio**, deux cartes de documents (**Préparation de l'audience** et **Après l'audience**), notes et compte rendu, décision, rapport d'audience et dossier associé. Boutons **Démarrer l'audience**, **Terminer l'audience**, **Générer un document**, **Reporter**, **Marquer tenue**, **Ajouter des documents**, **Modifier**, **Rapport**, **Exporter**. Sous le titre, la barre IA propose des raccourcis (préparer l'audience, pièces requises…) et la compétence **Compte rendu d'audience** (⚡).

## Prérequis
- Un **dossier** existant : une audience est toujours rattachée à un dossier. La **juridiction** n'est pas à saisir, elle est héritée du dossier.
- (Facultatif) Un **type d'audience**. Les types fournis sont : Préliminaire, Mise en État, Plaidoirie, Instruction, Conciliation, Jugement, Appel, Expertise, Cassation, Référé. Un nouveau type se crée depuis le champ **Type d'audience** du formulaire (bouton **Nouveau type** : nom et catégorie obligatoires — Pénale, Civile, Commerciale, Administrative, Sociale ou Autre —, durée par défaut, délai de préparation, public, requiert un avocat, distanciel, actif).
- Le **quota d'audiences** du plan d'abonnement ne doit pas être atteint.

## Planifier une audience — pas à pas
1. **Plus > Pilotage > Audiences > Nouvelle audience** (ou depuis un dossier). Le formulaire a deux étapes : « Informations essentielles » puis « Informations complémentaires » (une étape « Décision » existe pour la modification).
2. **Essentielles** : **Dossier**, **Date de l'audience**. Si l'audience fait suite à un renvoi, cochez **Cette audience est issue d'un renvoi**, puis choisissez l'**Audience renvoyée** (audience d'origine du même dossier) et le **Motif du renvoi**.
3. **Compléments** : **Heure** (09:00 par défaut), **Type d'audience**, **Durée (minutes)**, **Salle**, **Nom du juge**, **Documents liés** (documents du dossier), **Notes**.
4. **Créer l'audience**.

## Champs obligatoires
**Dossier** et **Date de l'audience**. Si l'audience est issue d'un renvoi : l'audience d'origine et le **motif** sont obligatoires (« Le motif du renvoi est obligatoire »).

La date doit être **dans le futur**. Une audience à moins de 48 heures exige le rôle administrateur ou la permission de dérogation, ainsi qu'un motif d'au moins 10 caractères : le champ **Motif de la création à moins de 48 heures** apparaît alors dans le formulaire, à côté de l'horaire, et le motif est conservé dans l'audit. Pour un report, c'est le motif du renvoi qui sert de justification. **Modifier** une audience sans toucher à sa date ni à son heure ne déclenche pas ce contrôle : on peut compléter les notes d'une audience passée.

## Statuts et règles
- **Planifiée** → **En cours** → **Tenue** ; une audience planifiée peut aussi passer **Reportée** ou **Annulée**.
- **Démarrer l'audience** (permission « modifier une audience ») : disponible sur une audience **Planifiée**, à tout moment, sans contrainte de date. Elle passe **En cours** et la fiche affiche « Audience en cours · démarrée il y a … ».
- **Terminer l'audience** (permission « marquer tenue ») : l'audience **En cours** passe **Tenue**, l'heure de fin est enregistrée et un enregistrement en cours s'arrête.
- **Marquer tenue** (permission « marquer tenue ») : pour une audience qui n'a pas été démarrée, possible seulement une fois la date et l'heure de l'audience passées (« Impossible de marquer l'audience comme tenue car elle n'a pas encore eu lieu »).
- **Reporter** (permission « reporter une audience ») : indisponible si l'audience est déjà reportée ou annulée. La fenêtre demande seulement la **nouvelle date**, la **nouvelle heure** (préremplie avec l'heure actuelle) et le **motif du renvoi**. Le rapport d'audience n'est pas exigé pour reporter : il se rédige à part (bouton **Rapport**). L'audience d'origine passe **Reportée** et est **figée** (plus modifiable) ; une **nouvelle audience Planifiée** est créée automatiquement avec les mêmes dossier, juridiction, type, salle, juge et durée, liée à l'originale (« issue du report de #…»).
- **Annuler** (permission « annuler une audience ») : possible tant que l'audience n'est ni tenue, ni reportée, ni annulée.
- **Décision** : le bouton **Decision** n'apparaît que sur une audience **Tenue**. Son texte peut venir d'un **Projet de décision** généré (voir plus bas). Il enregistre le texte de la **Décision**, l'**Issue de la décision** (Favorable, Défavorable, Partiel), la **Date de la décision**, les **Observations** et des **Documents de décision**.
- **Documents de l'audience** : la fiche affiche toujours deux cartes, **Préparation de l'audience (N)** (documents rangés avant l'audience) et **Après l'audience (N)** (documents ajoutés ensuite, plus les pièces du **compte rendu** et de la **décision**, signalées par un badge « Compte rendu » ou « Décision »). Chaque ligne montre l'icône du format, le nom, la nature, la date et s'ouvre d'un clic ; une carte vide l'indique. Chaque carte a son bouton **Ajouter**.
- **Ajouter des documents** (permission « envoyer un document ») : reste disponible sur une audience tenue (sauf reportée). Ouvre la page **Nouveau document** (`/documents/nouveau?audience=<id>&phase=preparation|after`) avec le dossier et l'audience déjà choisis et verrouillés, la case **Lié à une audience** cochée d'office et le **Moment** déjà choisi : « après » pour une audience tenue ou passée (ou `phase=after`), « préparation » sinon, modifiable. On peut y ajouter plusieurs documents, chacun avec son fichier (importé ou rédigé) et ses propres informations ; après l'enregistrement on revient à la fiche de l'audience, où ils apparaissent dans la bonne carte.
- **Modifier** : ouvre la page de modification (`/audiences/<id>/modifier`), le même formulaire que la création, prérempli. Le dossier ne change pas ; le renvoi, le rapport et la décision gardent leurs boutons. Indisponible sur une audience reportée. Des documents existants du dossier peuvent y être liés (champ **Documents liés**).

## Enregistrer et transcrire l'audience
Le bloc **Enregistrement audio** de la fiche enregistre le son depuis le navigateur (micro autorisé, page en https). Droit requis : **enregistrer une audience** (fourni aux rôles Administrateur, Avocat, Collaborateur et Secrétaire ; il couvre aussi la transcription et la suppression). L'écoute et la lecture ne demandent que le droit de voir les audiences.
1. Cliquez sur **Démarrer l'audience** : la fenêtre « Enregistrer l'audience ? » propose **Lancer l'enregistrement**. Vous pouvez aussi cliquer sur **Enregistrer** dans le bloc, sur toute audience non annulée.
2. Pendant l'enregistrement, le badge **REC** affiche la durée. Le son est découpé en **segments** (5 minutes par défaut) et chacun est envoyé dès sa fin. Sans réseau, les segments restent en attente et sont renvoyés automatiquement ; **Réessayer** relance l'envoi.
3. **Arrêter** envoie le dernier segment. **Terminer l'audience** arrête aussi l'enregistrement.
4. Sur chaque segment : **Écouter**, **Transcrire**, **Voir le texte** une fois transcrit, et la corbeille pour le supprimer. **Tout supprimer** efface tous les segments et leurs transcriptions, définitivement.
- États de la transcription : Transcription en attente, Transcription en cours, Transcrit, Aucune parole reconnue, Transcription échouée (**Transcrire** permet de relancer).
- La transcription est lancée segment par segment avec **Transcrire**, sauf si la plateforme a activé la transcription automatique.
- Les enregistrements comptent dans l'**espace de stockage** du cabinet.
- La plateforme peut désactiver l'enregistrement : les segments existants restent alors consultables. Si le moteur de transcription n'est pas configuré, le bouton **Transcrire** n'apparaît pas.

## Générer un document d'audience
Le bouton **Générer un document** de la fiche propose **Rapport d'audience**, **Procès-verbal** et **Projet de décision**, rédigés par l'IA d'après la transcription et les notes de l'audience. Droit requis : modifier une audience.
- Il n'est actif que si l'audience est **Tenue** et qu'elle a au moins un segment transcrit ou des notes (une infobulle indique ce qui manque).
- Le document s'ouvre dans la carte studio du chat : relecture, éditeur, **Word**, **PDF**, classement dans le dossier, et **Enregistrer dans le rapport de l'audience** (rapport, procès-verbal) ou dans sa décision (projet de décision). Un texte déjà enregistré sur l'audience n'est remplacé qu'après **Remplacer**.
- Rien n'est inventé : les propos viennent de la transcription, et les éléments à vérifier sont listés dans la carte. Un projet de décision reste un projet de travail.

## Automatismes
- **Rappel** : toutes les heures, le système prévient (notification « Rappel d'audience ») l'avocat responsable et les collaborateurs du dossier pour toute audience Planifiée qui a lieu dans les 48 heures, une seule fois.
- Les actions (tenue, report, annulation, décision, ajout de documents) envoient des notifications d'audience.
- La procédure du dossier (étape et sous-étape en cours) est rattachée automatiquement à l'audience.

## Erreurs fréquentes
- « Cette audience a déjà été reportée. » / « Une audience annulée ne peut pas être reportée. »
- « Cette audience a été reportée et ne peut plus être modifiée. Consultez l'audience de remplacement. »
- « Impossible d'ajouter une décision car l'audience n'est pas encore tenue. »
- « Impossible de marquer l'audience comme tenue car elle n'a pas encore eu lieu » → passez par **Démarrer l'audience** puis **Terminer l'audience**, ou attendez l'heure prévue.
- « Seule une audience programmée peut être démarrée » / « Seule une audience en cours peut être terminée. »
- « La date de l'audience doit être strictement future. »
- « Une audience à moins de 48 heures exige une permission de dérogation » / « Un motif d'au moins 10 caractères est obligatoire pour une audience à moins de 48 heures. »
- **Générer un document** grisé → l'audience n'est pas Tenue, ou elle n'a ni transcription ni notes (voir l'infobulle).
- « Accès au micro refusé » / « Aucun micro disponible » → autorisez le micro dans le navigateur.
- « La nouvelle date et la nouvelle heure de l'audience sont requises pour effectuer un report. »
- Bouton absent (Reporter, Marquer tenue, Annuler…) → permission manquante ou statut qui ne le permet pas.

## Créer depuis le chat
« Programme une audience pour le dossier DOS-2026-0039 le 15 juin 2026 à 14h30, salle 4B. » Seuls le dossier et la date sont obligatoires ; la juridiction vient du dossier et l'heure par défaut est 09:00. Le chat applique les mêmes règles que le formulaire : date future, et à moins de 48 heures, droit de dérogation et motif (dites-le dans la demande, ou saisissez-le dans la carte). Seule une audience déjà tenue, reportée ou annulée peut être consignée à une date passée. Je peux aussi reporter une audience si vous donnez la nouvelle date (et l'heure si elle change) ; le motif est conseillé, le rapport facultatif. Une carte de confirmation modifiable s'affiche avant l'enregistrement.

Depuis le chat, **Rapport / procès-verbal d'audience**, **Projet de décision d'audience**, **Compte rendu d'audience** et **Transcrire un enregistrement** s'appuient sur la transcription de l'audience (voir « Compétences Rapports & exports » et « Compétences Analyse juridique »).

**Documents d'une audience depuis le chat** : joignez les fichiers et mentionnez l'audience avec **@** (ou écrivez depuis sa fiche), par exemple « Classe ces pièces pour l'audience ». Ils sont rangés dans le dossier de l'audience et dans ses documents, avec nom, note, catégorie, nature, date et mots-clés déduits de leur contenu ; la carte de confirmation propose le **Moment** (Préparation ou Après l'audience, « après » par défaut pour une audience tenue ou passée). Un document rédigé dans le chat pour une audience (acte, compte rendu, transcription…) et classé depuis sa carte y est rattaché de la même façon.
