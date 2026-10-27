---
id: messages-notifications
title: Messages, notifications et chat interne
keywords: messages, messagerie, nouveau message, envoyer un message, e-mails du cabinet, e-mail, emails, mails, boite mail, courrier electronique, notification, notifications, cloche, rappel, rappels, marquer comme lu, tout lire, non lues, chat interne, conversation, conversations, discussion d'equipe, messagerie interne, message du dossier, envoyer un e-mail au client, echec d'envoi, mail en attente
paths: /mails, /chat, /notifications
---

# Messages, notifications et chat interne

KabySoft distingue trois canaux : les **e-mails** (menu Messages, vers l'extérieur), les **notifications** (cloche, alertes automatiques) et le **chat interne** (discussions d'équipe).

## 1. Messages — e-mails du cabinet

### À quoi ça sert
Écrire aux clients et aux tiers (suivi de dossier, envoi de facture, relance, convocation, partage de document…), et suivre tous les e-mails envoyés par l'application (automatiques et manuels).

### Où le trouver
- **Plus > Communication > Messages** (`/mails`, permission « voir les messages ») : page **Emails**. Boutons **Actualiser** et **Nouveau message**.
- Les textes des e-mails automatiques (notifications, relances, accès…) se règlent dans Plus > Configuration > Modèles (voir « Modèles »).
- Des raccourcis existent aussi sur les fiches : **Envoyer par email** (facture), **Contacter par email** (client, employé, apporteur), onglet Communication.

### Envoyer un message — pas à pas
1. **Messages > Nouveau message**.
2. Renseignez les **destinataires** (**À** avec autocomplétion, **Cc** et **Cci** facultatifs ; depuis un dossier, le destinataire peut être déduit automatiquement), le **Sujet**, le **Contenu** (« Rédigez votre message… », `@` pour insérer une référence : facture, document, audience…), et ajoutez des **Pièces jointes** si besoin. Cochez **Programmer l'envoi** pour un envoi différé (date et heure).
3. **Envoyer** (ou **Programmer** si l'envoi est planifié). Le message passe en **En attente** puis **Envoyé** ; en cas de problème il passe en **Échec** avec le motif affiché sous la ligne.

### Suivre les envois
- Onglets : **Tous**, **En attente**, **Envoyés**, **Échecs**, **Annulés**, chacun avec son compteur ; recherche libre et pagination (10 / 25 / 50 par page).
- Statuts : **En attente** (boutons **Envoyer** et **Annuler** sur la ligne), **Envoyé**, **Échec** (motif affiché sous la ligne), **Annulé**.
- Un e-mail envoyé ne peut pas être rappelé.

### Erreurs fréquentes
- Message en Échec → adresse invalide, boîte pleine ou serveur SMTP du cabinet mal configuré (Administration > SMTP, administrateur).
- Bouton Nouveau message absent → permission « voir les messages » ou droit d'envoi manquant.
- Modèle de texte manquant ou inactif → Plus > Configuration > Modèles (administrateur).

## 2. Notifications — la cloche

### À quoi ça sert
Les notifications préviennent automatiquement : **rappel d'audience** (48 h avant), **diligence assignée ou en retard** (J-7, J-3, J-1, jour J puis chaque jour), **document ajouté ou modifié** dans vos dossiers, **décision sur vos demandes** (avance, permission), **facture et paiement**, **action de dossier**.

### Où les trouver
- **Cloche** en haut à droite : pastille rouge avec le nombre de **non lues** (9+ au-delà de 9). Cliquez pour ouvrir le panneau **Notifications** (« X non lues » ou « Tout est à jour »).
- Filtres : **Toutes**, **Non lues**, **Importantes** (priorité haute ou urgente), chacun avec son compteur ; regroupement par date (**Aujourd'hui**, **Hier**, **Plus tôt**).
- Cliquez une notification pour la **marquer lue** et ouvrir l'élément lié (dossier, audience, facture…) ; **Tout lire** marque tout comme lu ; chaque ligne peut être **archivée** ou **supprimée**.
- Bouton **Préférences** du panneau (`/notifications/preferences`) : choisissez ce que vous recevez.

### Règles
- Vous ne recevez que les notifications des dossiers et modules auxquels votre rôle a accès.
- Les notifications temps réel exigent une connexion active (pastille de connexion dans la barre du haut).

## 3. Chat interne — discussions d'équipe

### À quoi ça sert
Discuter entre collaborateurs (un à un ou en groupe) et, **dans chaque dossier**, dans l'onglet **Chat** de la fiche (conversation créée automatiquement à l'ouverture du dossier, équipe notifiée).

### Où le trouver
- Page **Chat** (`/chat`) : liste des conversations à gauche, fil de discussion à droite ; **Nouvelle conversation** (choix des participants dans l'annuaire, **« Saisir le nom du groupe »** si groupe, puis **Démarrer** / **Créer le groupe**) ; pièces jointes possibles dans les messages.
- Onglet **Chat** de la fiche dossier : conversation liée au dossier.

### Règles
- Les conversations sont internes au cabinet ; les échanges avec le client passent par les **Messages** (e-mails) ou l'**espace client**, pas par ce chat.
- L'historique est conservé par conversation ; les nouveaux participants voient les messages à partir de leur ajout.

## Depuis le chat IA
« Envoie la facture FAC-2026-0003 au client », « Relance le client du dossier DOS-2026-0001 » : j'envoie le même e-mail que les boutons, avec carte de confirmation (destinataire modifiable). Les notifications et le chat d'équipe se consultent dans leurs pages, pas depuis le chat IA.
