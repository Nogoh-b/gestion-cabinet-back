---
id: administration
title: Administration (sécurité, SMTP, sauvegarde, audit, IA)
keywords: administration, admin, securite, double authentification, authentification, mot de passe, smtp, serveur mail, configuration smtp, e-mail de test, sauvegarde, sauvegardes, backup, restaurer, audit, journal d'audit, supervision, activite des utilisateurs, moteur ia, assistant ia, cles ia, utilisateurs admin, roles admin, preferences de notification
paths: /admin, /admin/security, /admin/smtp, /admin/backup, /admin/audit, /admin/ai
---

# Administration (sécurité, SMTP, sauvegarde, audit, IA)

## À quoi ça sert
La page **Administration** (menu du compte, administrateur) regroupe les réglages techniques du cabinet : comptes et rôles, **double authentification**, **serveur d'e-mails (SMTP)**, **sauvegardes**, **audit** (qui a fait quoi) et **moteur IA**.

## Où le trouver
- Menu du compte (avatar) > **Administration** (`/admin`, administrateur uniquement) : cartes de chiffres (Utilisateurs, Clients, Dossiers, Alertes actives) puis sections : **Utilisateurs** (`/users`), **Rôles & permissions** (`/roles` — voir « Rôles et permissions »), **Authentification** (`/admin/security`), **SMTP**, **Sauvegarde** (`/admin/backup`), **Audit** (`/admin/audit`), **IA** (`/admin/ai`).

## 1. Authentification — double authentification
- Page **Authentification** (`/admin/security`) : interrupteur **Activer / Désactiver** la **double authentification (OTP e-mail)** — un code à usage unique est alors envoyé par e-mail à chaque connexion, en plus du mot de passe (« Double authentification activée — un code sera demandé à la connexion »).
- Chaque collaborateur peut aussi l'activer depuis son profil (onglet Sécurité).

## 2. SMTP — serveur d'envoi d'e-mails
- Page **Configuration SMTP** (`/admin/smtp`) : **hôte**, **port** (465 par défaut), **sécurisé**, identifiants, expéditeur. **Enregistrer** (« Configuration SMTP enregistrée »), puis **tester** : saisissez une **adresse de test** et envoyez l'e-mail de test (« E-mail de test envoyé »).
- Sans SMTP valide, les e-mails (factures, relances, accès clients, codes OTP) restent en **Échec** dans Messages. Le mot de passe enregistré est masqué après l'enregistrement.

## 3. Sauvegarde
- Page **Sauvegarde** (`/admin/backup`) : bouton **Créer** (« Sauvegarde créée »), liste des sauvegardes (nom, taille, date) avec **Télécharger** et **Supprimer** (confirmation « Supprimer la sauvegarde … ? »).
- Pensez à télécharger régulièrement une copie hors du serveur.

## 4. Audit et supervision
- Page **Audit** (`/admin/audit`) : **journal** filtrable (qui, quoi, quand — sessions, clients, dossiers, documents, audiences, diligences, factures, fournisseurs, notifications, traitements du dossier, administration) avec lien vers l'élément concerné, et **supervision** des membres (rôle, présence, activité).
- Sert en cas de litige ou d'erreur : retrouver qui a modifié, validé, envoyé ou supprimé quoi.

## 5. Moteur IA du cabinet
- Page **Moteur d'intelligence artificielle** (`/admin/ai`, administrateur) : affiche à titre d'information le **fournisseur**, le **modèle** et l'état (**Opérationnel** / Clé absente) — le moteur est **géré par la plateforme KabySoft** (« Géré par la plateforme », contacter le support pour tout changement).
- Les **contextes et suggestions** de l'assistant (où l'IA aide, avec quelles consignes du cabinet) se règlent dans cette page : activation par contexte, instructions du cabinet ajoutées aux réponses.

## Règles
- Tout cet espace est réservé à l'**administrateur** ; les autres rôles sont renvoyés vers le tableau de bord.
- Un réglage SMTP ou IA erroné bloque les envois ou l'assistant : testez après chaque changement.
- L'audit est en lecture seule : on ne modifie ni ne supprime l'historique.

## Erreurs fréquentes
- Page Administration invisible → vous n'êtes pas administrateur.
- « Accès refusé ou erreur » (sauvegardes) → droits insuffisants ou service indisponible.
- E-mails en échec après changement SMTP → renvoyez un e-mail de test et corrigez hôte, port et identifiants.
- Assistant IA « désactivé dans ce contexte » → réactivez le contexte dans Administration > IA.

## Depuis le chat
L'administration se règle dans ces pages, pas depuis le chat. Je peux en revanche expliquer chaque réglage et diagnostiquer un échec d'envoi ou d'accès.
