---
id: assistant-ia
title: Assistant IA (chat)
keywords: assistant ia, assistant intelligent, chatbot, chat ia, poser une question, que peux-tu faire, que sais-tu faire, que peut faire l'assistant, modes du chat, menu slash, mode lecture, mode ecriture, mode conversation, base de connaissance, base juridique, carte de confirmation, creer depuis le chat, confirmer la creation, annuler la creation, pre-remplir un formulaire, joindre un document au chat, creer des dossiers a partir de fichiers, creer des dossiers a partir des fiches, classer plusieurs fichiers, ecrire avec vos mots, mention, quotas ia, requetes ia, suggestions de l'assistant, contexte de la page, mon role, mes droits, profil de l'utilisateur, reponse en plusieurs parties
paths: /chat
---

# Assistant IA (chat)

## À quoi ça sert
L'**assistant IA** répond en langage naturel pour **interroger vos données** (« factures impayées de Jean Dupont »), **créer ou modifier** (dossier, client, facture, audience, bulletin… — avec une carte de confirmation dès qu'il y a un doute, plusieurs opérations, une suppression ou un envoi), **lancer des compétences** (actions guidées : e-mails, actes, analyses juridiques, calculs de délais…), **expliquer l'utilisation** de l'application (mode Aide) et **consulter la base juridique** de la plateforme.

## Où le trouver
- **Bouton flottant « Poser une question »** (bulle en bas de l'écran, toute l'application) : ouvre la fenêtre de chat.
- **Boutons « Poser une question »** sur les pages et fiches : ouvrent le chat **avec le contexte de la page** (la question « comment créer ? » sans sujet utilise alors la page ouverte).
- **Dans les formulaires** : bloc d'assistance IA (« Écrivez avec vos mots ou joignez un document… », bouton **Joindre un document**) qui **pré-remplit les champs** depuis votre texte ou votre fichier — vous relisez puis enregistrez.

## Les modes (menu « / »)
Tapez **/** dans la zone de saisie pour forcer un mode, ou laissez **Auto** (l'assistant choisit selon la question) :
| Mode | Effet |
|---|---|
| **Auto** | L'assistant choisit selon la question |
| **Lire** | Interroge vos données, sans rien modifier (lecture seule) |
| **Écrire** | Crée, modifie ou supprime ; carte de confirmation dès qu'il y a un doute, plusieurs opérations, une suppression ou un envoi |
| **Conversation** | Discussion libre, sans vos données |
| **Base de connaissance** | Répond depuis la base juridique de la plateforme (textes importés) |
| **Aide** | Explique comment utiliser l'application, d'après ses guides |

Détail de chaque mode, des niveaux de réflexion et de la différence entre mode, compétence et mention : guide **Modes du chat**.

Tapez **@** pour **mentionner un élément précis** (dossier, client…) : choisissez la catégorie puis recherchez-le ; seules les catégories autorisées par vos permissions apparaissent.

## Les compétences (menu « # »)
Tapez **#** (ou le bouton **⚡** de la saisie) pour choisir une **action guidée**, puis décrivez ce que vous voulez et mentionnez la fiche avec **@** (ou ouvrez-la) :
| Famille | Compétences |
|---|---|
| **Communication** | Envoyer un e-mail (modèles du cabinet, pièces de la GED, envoi programmé), Préparer un WhatsApp (envoyé depuis votre WhatsApp), Message à l'espace client, Message à un collaborateur, Envoyer une facture, Relancer les impayés |
| **Documents** | Courrier, Mise en demeure, Document depuis un modèle (attestation, avis d'audience…), Traduire (français ↔ anglais), Version bilingue FR \| EN, Anonymiser un document |
| **Analyse juridique** | Lire un jugement, Répondre aux conclusions adverses, Chronologie et contradictions, Auditer un contrat, Contrôler les mentions d'un acte, Évaluer les chances du dossier, Dossiers comparables, Dossier de plaidoirie |
| **Calculs & actes** | Calculer un délai de procédure, Décompte de créance, Requête en injonction de payer, Convention d'honoraires |
| **Rapports & exports** | Rapport d'activité (période au choix), État des impayés, Exporter un dossier (ZIP), Compte rendu d'audience |
| **Agenda & tâches** | Programmer une audience, Reporter une audience, Créer une diligence, Enregistrer un paiement |
En mode Auto, nommer la compétence avec un verbe d'action suffit souvent (« prépare un WhatsApp pour ce client »). Chaque compétence se termine par une **carte à valider** (e-mail, message, document, plan) : rien ne part ni ne s'enregistre avant votre clic. Seules les compétences permises par votre rôle (et votre plan) apparaissent. La compétence ne vaut que pour la question envoyée ; retirez-la avec ✕ ou Retour arrière. Détails : guide **Compétences du chat**, puis un guide par famille (Communication, Documents, Analyse juridique, Calculs & actes, Rapports & exports et Agenda & tâches).

## Créer depuis le chat — pas à pas
1. Demandez en une phrase : « Ouvre un dossier pour Jean Dupont… », « Facture le dossier DOS-2026-0012 : 500 000 FCFA HT… », « Programme une audience… ». Donnez les éléments par leur **nom** (client, avocat, juridiction) ou leur **numéro** (`DOS-…`, `FAC-…`).
2. L'assistant affiche une **carte de confirmation modifiable** dès que la demande comporte plusieurs opérations, une suppression, un envoi, une modification groupée, une valeur incertaine ou un élément jamais affiché : opération (**Création**, **Modification**, **Suppression**, **Action**), élément visé et champs (crayon pour corriger une valeur, listes pour les choix). Une création simple et sans ambiguïté peut être exécutée directement ; le compte rendu liste alors ce qui a été créé, avec un lien.
3. Une valeur sans correspondance exacte (type ou sous-type de procédure, juridiction, client…) est signalée dans la carte : choisissez l'un des éléments proches proposés en tête de liste, ou **➕ Créer « … »**. **Confirmer** attend ce choix, puis l'applique tel quel : l'élément choisi est rattaché, ou la nouvelle valeur est créée (un sous-type sous le type choisi), sans nouvelle question. Une valeur introuvable sans rien d'approchant est proposée à la création ; une ville ou une agence n'est jamais créée depuis le chat.
4. Relisez, corrigez si besoin, puis **Confirmer** (ou **Annuler**) : rien de ce qu'affiche la carte n'est enregistré avant Confirmer. Si une opération échoue, tout ce que le plan avait déjà créé est supprimé (rien ne reste en corbeille). Un e-mail envoyé (facture, relance) ne peut pas être rappelé.
5. Chaînage possible : « Facture le dossier DOS-2026-0012 et envoie-la au client » crée puis envoie, seulement si la création a réussi.

## Joindre un document au chat
Joignez le fichier à votre message avec votre consigne (« Classe ce document dans le dossier DOS-2026-0039, nature Contrat », « Résume-moi ce jugement »). Sans fichier joint, aucun document ne peut être créé ni classé.
- **Classer** : « ajoute ces documents au dossier DOS-… », « classe ces fiches » → carte d'ajout des fichiers au dossier.
- **Créer à partir du contenu** : « lis ces fiches et crée les différents dossiers », « crée ces clients à partir des fiches » → un dossier par affaire décrite (client réutilisé s'il existe, sinon créé), toujours présenté dans la carte de confirmation, avec le fichier d'où vient chaque opération. Ajoutez « et classe les fichiers dedans » pour que chaque fichier soit ensuite proposé dans le dossier créé à partir de lui.
- **Demande ambiguë** (« traite ces fiches », « enregistre-les ») : l'assistant demande quoi faire — classer, créer à partir du contenu, les deux, ou seulement lire.
- Jusqu'à 5 fichiers sont lus par message (10 pour un simple classement).

## Votre profil et plusieurs demandes à la fois
- L'assistant connaît **votre profil** à chaque question : nom, fonction, profil d'accès et droits, cabinet, plan, abonnement et quotas. « Quel est mon rôle ? », « quel est mon plan ? », « combien de requêtes IA me reste-t-il ? » reçoivent une réponse directe, sans demande de précision.
- Une même question peut enchaîner plusieurs demandes (« quel est mon rôle et liste mes dossiers », « résume le dossier puis prépare un WhatsApp au client ») : la réponse est découpée en parties, chacune dans son mode. Détails : guide **Modes du chat**.

## Règles et droits
- L'assistant applique **vos permissions** : il ne lit et ne crée que ce que votre rôle permet (« Accès non autorisé » sinon).
- Les demandes **hors de vos modules** (ex. paie sans le module Paie) sont refusées comme dans l'interface.
- **Quotas IA du plan** : requêtes IA par mois limitées selon l'abonnement (voir Abonnement) ; au-delà, l'assistant le signale.
- **« L'assistant IA est désactivé dans ce contexte »** → l'administrateur l'a coupé pour cette page (Administration > IA) ; les consignes du cabinet éventuelles s'ajoutent aux réponses.

## Erreurs fréquentes
- « Accès non autorisé » → votre rôle ne permet pas cette donnée ou cette action.
- Carte de confirmation vide ou incomplète → précisez les informations manquantes (l'assistant les signale) puis renvoyez.
- « Le module … n'est pas inclus dans votre plan » → comme dans l'interface, mise à niveau nécessaire.
- Réponse qui invente un bouton → demandez en mode **Aide** (`/aide`) : la réponse suit alors strictement les guides documentés.

## Depuis le chat (vous y êtes)
Demandez « que peux-tu faire ? » pour un rappel des capacités, ou nommez directement le sujet : « comment fonctionne la paie ? », « combien de dossiers ouverts ce mois ? », « crée le client… ».
