---
id: modes-chat
title: Modes du chat (menu « / ») et niveaux de réflexion
keywords: modes du chat, menu slash, touche slash, choisir un mode, changer de mode, mode auto, mode automatique, mode lire, mode lecture, lecture seule, mode ecrire, mode ecriture, mode conversation, discussion libre, mode base de connaissance, base de connaissance, base juridique, mode aide, revenir au mode automatique, options avancees, niveau de reflexion, mode rapide, mode equilibre, mode precis, difference entre mode et competence, reponse en plusieurs parties, plusieurs demandes dans une question, competence lancee automatiquement, lancee automatiquement, choisie automatiquement, competence reconnue automatiquement, en plusieurs parties, questions sur mon compte
paths: /chat
---

# Modes du chat (menu « / »)

## À quoi ça sert
Le **mode** indique au chat comment traiter vos questions. Par défaut, **Auto** choisit pour vous. Forcer un mode est utile quand la réponse part dans la mauvaise direction (une lecture traitée comme une création, une question juridique qui interroge vos données…).

## Choisir un mode
- Tapez **/** au début d'un mot dans la saisie (« /lire », « /aide »…) ou cliquez sur le bouton **/** de la barre d'outils, puis choisissez avec les flèches et **Entrée**.
- Ou ouvrez **Options** sous la saisie : les modes y sont proposés en boutons.
- Le mode actif s'affiche en puce dans la saisie ; **✕** revient au mode **Auto**. Contrairement à une compétence, **le mode reste actif** pour les questions suivantes.

## Les modes
| Mode | Ce qu'il fait | Exemples |
|---|---|---|
| **Auto** (défaut) | L'assistant choisit : lecture de vos données, création ou modification, conseil, réponse juridique, aide d'utilisation, **compétence** reconnue dans la demande, réponse sur **votre compte**, ou plusieurs de ces modes dans une même réponse (voir ci-dessous). | « Factures impayées de Jean Dupont » · « Crée le client… » · « Prépare un WhatsApp pour ce client » |
| **Lire** | Interroge vos données sans rien modifier (listes, chiffres, fiches). Une demande manifestement d'écriture (« crée… », « supprime… ») reste toutefois traitée comme une écriture. | « Audiences de la semaine prochaine » |
| **Écrire** | Crée, modifie ou supprime des données, ou déclenche un envoi (facture, relance). | « Programme une audience le 12/11 pour DOS-2026-0001 » |
| **Conversation** | Discussion libre, sans interroger vos données et sans le contexte de la page ouverte (rédaction, reformulation, question générale). Une fiche mentionnée avec **@** est toutefois lue : ses informations (dossier, client, activité, prochaine audience) servent à la réponse. | « Reformule ce paragraphe plus poliment » |
| **Base de connaissance** | Répond uniquement à partir de la **base juridique de la plateforme** (textes importés par l'administrateur de la plateforme), sans le contexte de la page. Sans extrait pertinent, un avertissement le précède et la réponse reste générale. | « Que prévoit l'AUPSRVE sur l'opposition ? » |
| **Aide** | Explique comment utiliser l'application d'après ses guides (menus, boutons, règles). Garde la page ouverte : « comment en créer un ? » vise l'écran affiché. | « Comment clôturer un dossier ? » |

## Le mode Auto en détail
L'icône du mode s'affiche en tête de chaque réponse (« Lire · auto », « Compétence · Préparer un WhatsApp · auto ») ; l'infobulle dit pourquoi ce mode a été choisi.

### Compétences reconnues sans « # »
- Quand vous **nommez une compétence avec un verbe d'action**, elle est lancée directement : « je veux préparer un WhatsApp », « rédige une mise en demeure pour M. Kamga », « calcule le délai d'appel à partir du 12/10 », « anonymise ce document », « fais le compte rendu de l'audience d'hier ».
- Elle se termine, comme toujours, par une **carte à valider** : rien ne part sans votre clic.
- Pas de lancement automatique pour une **question d'usage** (« comment préparer un WhatsApp ? » → Aide), une **consultation** (« quels courriers ont été envoyés hier ? » → Lire) ou une **question de droit** (« quel est le délai d'appel ? » → Conversation).
- Les écritures guidées (programmer ou reporter une audience, créer une diligence, enregistrer un paiement) et les envois de facture suivent le parcours habituel d'écriture.
- Quand deux compétences conviennent autant l'une que l'autre, l'assistant tranche lui-même ou vous propose le choix sur la carte « Comment dois-je traiter votre demande ? ».

### Questions sur votre compte
« Quel est mon rôle ? », « que puis-je faire ? », « quel est mon plan d'abonnement ? », « quand expire mon abonnement ? », « la paie est-elle incluse dans mon plan ? », « combien de requêtes IA me reste-t-il ? » reçoivent une réponse directe, tirée de votre profil réel : nom, fonction, profil d'accès, droits par module, cabinet, plan, abonnement et quotas. Le tarif n'apparaît qu'aux administrateurs et aux utilisateurs qui gèrent l'abonnement. Ce profil accompagne aussi toutes vos questions : l'assistant sait toujours quel est votre rôle et ce que permet votre plan (« mes dossiers » vise vos dossiers).

### Plusieurs demandes dans une même question
Enchaînez vos demandes avec « et », « puis » ou « ensuite » : « quel est mon rôle et liste mes dossiers en cours », « résume les actions du dossier DOS-2026-0038 puis prépare un WhatsApp au client », « explique comment créer une audience, ensuite montre mes audiences de demain ».
- Chaque partie est traitée dans son mode, dans l'ordre ; la réponse les sépare par un trait et le badge les liste (« Aide + Lire »).
- La partie suivante s'appuie sur la précédente : le WhatsApp reprend le récapitulatif lu juste avant, et le dossier qui y est cité.
- Une création ou une modification passe toujours **en dernier** ; si elle demande une confirmation (ou si une partie demande une précision), la réponse s'arrête sur cette carte.
- Trois demandes au plus par question ; au-delà, envoyez-les séparément.

## Écritures et confirmation
- La carte **Confirmation requise** s'affiche dès que la demande comporte plusieurs opérations, une suppression, un envoi (e-mail, relance), une modification groupée, une valeur incertaine ou un élément jamais affiché dans la conversation. Elle est modifiable ; **Annuler** n'exécute rien.
- Une création ou une modification **simple et sans ambiguïté** peut être exécutée directement : le compte rendu liste alors ce qui a été créé ou modifié, avec les liens vers les fiches.
- Les **compétences** (« # ») passent, elles, toujours par une carte à valider.

## Mode, compétence et mention : la différence
- **/ mode** : la manière de traiter vos questions, durablement (lire, écrire, discuter, base juridique, aide).
- **# compétence** : une action spécialisée et guidée pour une seule question (envoyer un e-mail, lire un jugement, calculer un délai…). Tant qu'une compétence est choisie, le mode est mis de côté. En mode Auto, nommer la compétence avec un verbe d'action suffit souvent (« prépare un WhatsApp »).
- **@ mention** : la fiche ou le message précis sur lequel porte la question (client, dossier, audience, facture, collaborateur, document, ou un message de la conversation à citer).

## Niveau de réflexion (Options)
- **Rapide** (défaut) : réflexion réduite, réponses plus rapides.
- **Équilibré** : compromis vitesse / profondeur.
- **Précis** : réflexion complète, plus lent mais plus rigoureux (utile pour les analyses juridiques longues).
Le niveau choisi est mémorisé sur votre poste.

## Erreurs fréquentes
- La réponse liste des données alors que vous vouliez créer → passez en **Écrire** (« /ecrire »).
- La question juridique déclenche une recherche dans vos dossiers → passez en **Base de connaissance**.
- Une réponse d'aide invente un bouton → posez la question en mode **Aide** : elle suit alors strictement les guides.
