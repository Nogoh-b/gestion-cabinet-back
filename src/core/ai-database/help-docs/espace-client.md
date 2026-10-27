---
id: espace-client
title: Espace client (portail)
keywords: espace client, portail client, portail, acces client, compte client, envoyer les acces, mes dossiers, mes factures, declarer un paiement, payer ma facture, messages du client, profil client, client connecte, numero de dossier au tribunal, reste a payer du client
paths: /espace-client
---

# Espace client (portail)

## À quoi ça sert
L'**espace client** est le portail en ligne où **vos clients** suivent leurs dossiers, consultent et règlent leurs factures, et échangent avec le cabinet — sans voir le reste de l'application ni les données des autres clients.

## Côté cabinet : donner l'accès — pas à pas
1. Le client doit avoir une **adresse e-mail** dans sa fiche (sinon « Ce client n'a pas d'adresse email enregistrée »).
2. Fiche du client > **Envoyer les accès** : crée (ou réinitialise) son compte et lui envoie par e-mail son identifiant et un **mot de passe temporaire** (à changer à la première connexion).
3. Le client se connecte au portail avec le rôle **Client** (« refus par défaut » : seules les pages du portail lui sont ouvertes).

## Côté client : les pages du portail
- **Accueil** (`/espace-client`) : « Bonjour, … » + 4 cartes — **Dossiers actifs** (et total), **Reste à payer** (et factures à régler, paiements en vérification), **Documents en attente** (en cours de validation par le cabinet), **Messages non lus** — puis dossiers récents.
- **Mes dossiers** (`/espace-client/dossiers`) : liste avec recherche par numéro ou objet ; fiche par dossier (numéro, objet, statut, avocat, dates).
- **Mes factures** (`/espace-client/factures`) : deux listes — **À régler** et **Réglées ou en cours de vérification**. Le client **déclare son paiement** (montant, référence) ; le cabinet le **vérifie puis le valide** côté Factures — le paiement n'est compté qu'après validation.
- **Messages** (`/espace-client/messages`) : fil de discussion avec le cabinet, par dossier ; les réponses du cabinet affichées passent en lues ; actualisation régulière.
- **Profil** (`/espace-client/profil`) : coordonnées du client.

## Règles
- Un client ne voit que **ses propres** dossiers, factures et messages ; les montants internes, les autres clients et les pages du cabinet lui sont invisibles.
- Rôle **Client** : rôle système protégé, ni supprimable ni recréé ; ses permissions ne se règlent pas comme les autres rôles.
- Les documents que le client dépose restent **en attente** jusqu'à validation du cabinet.
- En cas de perte d'accès : renvoyez les accès depuis la fiche client (nouveau mot de passe temporaire).

## Erreurs fréquentes
- « Ce client n'a pas d'adresse email enregistrée » → renseignez l'e-mail dans la fiche.
- Le client ne voit pas un dossier → le dossier n'est pas rattaché à ce client, ou le compte utilisé n'est pas le sien.
- Paiement déclaré mais facture toujours « à régler » → normal tant que le cabinet ne l'a pas validé.

## Depuis le chat (côté cabinet)
« Envoie les accès au client Jean Dupont », « Le client SARL Kamga a-t-il des impayés ? » : je guide l'envoi d'accès et je consulte les factures du client dans la limite de vos droits. Le portail lui-même s'utilise dans le navigateur du client.
