---
id: clients
title: Clients
keywords: client, clients, nouveau client, creer un client, ajouter un client, fiche client, gestion des clients, code client, type de client, types de client, types de clients, groupes de clients, groupe de clients, particulier, entreprise, raison sociale, espace client, portail client, acces client, envoyer les acces, journal des communications, comment nous a-t-il connu, rccm, nui, client professionnel, quartier du client, sante financiere
paths: /clients
---

# Clients

## À quoi ça sert
La fiche client représente chaque personne ou société que le cabinet défend ou conseille. Elle porte l'identité, les coordonnées, les informations légales (pour les professionnels), le **type de facturation** habituel et l'**agence** de rattachement. Le client est ensuite choisi dans les dossiers, les factures, les documents et les audiences, et peut recevoir un accès à l'**espace client** (portail en ligne).

## Où le trouver
- Menu **Clients** (`/clients`, section « Relation client », permission « voir les clients ») : la liste, avec recherche par nom, e-mail ou téléphone, filtre **Statut du client** (Tous les statuts, Actif, Inactif), filtre **Type de client** et cartes de statistiques.
- Bouton **Nouveau client** en haut de la liste (`/clients/nouveau`, permission « créer un client »).
- Menu **Plus > Cabinet > Groupes de clients** (`/clients/groupes`) : la liste des **types de clients** (page « Types de Clients »).
- Fiche d'un client (`/clients/<id>`, redirigée vers `/clients/<id>/fiche`) : **Identité**, **Coordonnées**, **Informations**, boutons **Compléter** (champs manquants), **Modifier**, **Envoyer les accès** (espace client) et **Gestion complète**. La page **Gestion complète** (`/clients/<id>/gestion`) porte les onglets **Aperçu**, **Dossiers**, **Factures** et **Documents** (ces deux derniers n'apparaissent que si le client en a), **Communication** (e-mails) et **Journal** (appels, réunions, courriers). Les onglets Communication et Journal sont réservés aux rôles administrateur, avocat et secrétaire.

## Prérequis
- Au moins une **agence** active (Agences) : un client est toujours rattaché à une agence.
- Au moins un **type de client** actif (les types usuels sont fournis : Client Particulier, Client Professionnel, Entreprise, Association, Collectivité, Étranger, Administration, Cabinet d'Avocats, Expert Comptable, Notaire). Un nouveau type se crée depuis la page Groupes de clients ou directement dans le formulaire client (bouton **Nouveau type** à côté du champ).
- Le **quartier** (référentiel géographique) du client doit exister dans la liste.
- Le **quota de clients** du plan d'abonnement ne doit pas être atteint (voir Abonnement).

## Créer un client — pas à pas
1. **Clients > Nouveau client**. Le formulaire est découpé en quatre étapes ; un bloc d'assistance IA permet de coller un texte ou joindre un document (PDF, Word, image) pour pré-remplir prénom, nom, e-mail, téléphone, date de naissance et adresse.
2. **Identité** : **Type de client**, **Prénom**, **Nom**, **Raison sociale** (masquée pour le type Particulier), **Date de naissance**, **Numéro unique d'identification** (NUI).
3. **Contact** : **Email**, **Téléphone principal**, **Téléphone secondaire**, **Téléphone professionnel** et **Fax** (ces deux derniers masqués pour un particulier).
4. **Adresse** : **Adresse**, **Code postal**, **Pays** (Cameroun, non modifiable), **Quartier** (recherche dans la liste).
5. **Pro & Facturation** : **SIRET** (14 chiffres), **Numéro TVA**, **RCCM** (visibles pour les professionnels et entreprises) ; **Type de facturation** (Forfait, Temps passé, Mixte), **Agence**, **Comment nous a-t-il connu ?**.
6. **Créer le client**. Le message « Client créé » s'affiche et la fiche s'ouvre.

## Champs obligatoires
**Type de client**, **Prénom**, **Nom**, **Quartier** et **Agence**. Tout le reste est facultatif. L'e-mail, s'il est saisi, doit avoir un format valide. Le **code client** (numéro à 7 chiffres, par exemple 0000042) est attribué automatiquement et ne peut plus être modifié ensuite.

## Statuts et règles
- Un client nouvellement créé est **Actif**. Les statuts possibles sont Actif, Inactif, Supprimé, Bloqué, Suspendu et Verrouillé ; la liste filtre sur Actif et Inactif.
- À la **modification** (bouton **Modifier** de la fiche) : le **SIRET** doit comporter 14 chiffres, le **NUI** uniquement des chiffres, le **type de facturation** doit être Forfait, Temps passé ou Mixte, et l'e-mail ne doit pas déjà appartenir à un autre client.
- Le **type de facturation** du client est la valeur par défaut proposée à la configuration de la facturation de ses dossiers (voir Configuration de la facturation).
- La page **Gestion complète** (onglet **Aperçu**) affiche aussi la **situation financière** (Total facturé, Montant payé, Solde impayé, Santé financière) ; ces montants ne sont visibles qu'avec la permission de voir les factures.
- **Supprimer** un client demande la permission « supprimer un client » ; l'action est précédée d'un court délai d'annulation. Un client déjà utilisé dans des dossiers ou des factures est à conserver : ne le supprimez pas sans nécessité.

## Actions de la fiche et de la gestion complète
- Fiche : **Compléter** (champs manquants uniquement), **Modifier**, **Envoyer les accès**, **Gestion complète**.
- Gestion complète : **Modifier**, **Créer un dossier** (ouvre l'ouverture de dossier avec ce client déjà choisi), **Exporter** (fiche client, attestation selon vos droits).
- Actions rapides (gestion complète) : **Contacter par email**, **Appeler**, **Voir les dossiers**, **Voir les factures**, **Envoyer les accès**, **Archiver**, **Supprimer**.
- **Envoyer les accès** : crée (ou réinitialise) le compte de connexion du client à l'espace client et lui envoie par e-mail son identifiant et un mot de passe temporaire. Le client doit avoir une adresse e-mail, sinon l'action est impossible (« Ce client n'a pas d'adresse email enregistrée »). Un client connecté au portail ne voit que ses propres informations.
- Gestion complète, onglet **Journal** : consigner manuellement un appel, une réunion ou un courrier (type et objet obligatoires). L'onglet **Communication** sert à écrire et suivre les e-mails envoyés au client.

## Les types de clients (Groupes de clients)
Un type de client a un **Nom** (obligatoire) et un **Code** (facultatif, généré automatiquement si laissé vide). Créez-en un depuis **Nouveau type de client** sur la page Groupes de clients. Les types servent à classer les clients, à filtrer la liste et à définir les documents exigés à l'ouverture d'un compte.

## Automatismes
- Le code client est généré à la création (numérotation globale, jamais réutilisée).
- Si le formulaire est enregistré depuis un champ « + Créer » (création rapide d'un client dans un dossier ou une facture) avec seulement un nom, l'agence, le type et le quartier prennent leur première valeur disponible.

## Erreurs fréquentes
- « Le nom du client est obligatoire (nom et prénom). » → renseignez au moins un nom.
- « Aucune agence active n'est configurée… » / « Aucun type de client actif… » → créez d'abord l'agence ou le type.
- Quota de clients atteint → voir Abonnement.
- « Email already exists » à la modification → l'adresse appartient déjà à un autre client.
- « SIRET must be 14 digits » / « NUI must contain only digits » à la modification.
- Boutons absents → permissions insuffisantes (créer, modifier, supprimer un client sont des permissions distinctes).

## Créer depuis le chat
« Crée le client Jean Dupont, e-mail jean.dupont@mail.cm, téléphone 690 00 00 00 » ou « Ajoute l'entreprise SARL Kamga comme client ». Un nom, un prénom ou une raison sociale suffit ; l'agence, le type et le quartier prennent par défaut la première valeur active. Je vérifie les doublons (e-mail, téléphone, nom) et une carte de confirmation modifiable s'affiche avant l'enregistrement.
