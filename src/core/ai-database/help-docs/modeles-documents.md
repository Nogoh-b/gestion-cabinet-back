---
id: modeles-documents
title: Modèles de mails, de PDF et en-têtes / pieds de page
keywords: modele de mail, modeles de mail, modeles de mails, template de mail, templates de mail, templates d'e-mail, modele d'e-mail, modele pdf, modeles pdf, modeles de documents pdf, modele de facture, personnaliser la facture, personnaliser un document, en-tete, en-tetes, pied de page, pieds de page, en-tetes et pieds de page, bloc d'en-tete, variables de modele, variable dans un mail, apercu du modele, logo du document, modele systeme, police du modele
paths: /mail-templates, /pdf-templates, /template-blocks
---

# Modèles de mails, de PDF et en-têtes / pieds de page

## À quoi ça sert
Ce module personnalise l'**apparence et le texte** de tout ce que le cabinet envoie ou imprime :
- les **modèles de mails** : e-mails automatiques (connexion, réinitialisation de mot de passe, notifications) et modèles proposés dans la rédaction d'un message (suivi de dossier, envoi de facture, relance de paiement, convocation à une audience, rappel d'audience, partage de document, clôture de dossier, confirmation de rendez-vous…) ;
- les **modèles PDF** : factures, fiches dossier, fiches client, attestations, comptes-rendus d'audience, ordres de mission et rapports de diligence ;
- les **en-têtes et pieds de page** : blocs réutilisables (logo, coordonnées du cabinet…) greffés sur les modèles de mails ou de PDF.

## Où le trouver
Réservé à l'**administrateur**. Menu **Plus > Configuration > Modèles** :
- **Modèles** (`/mail-templates`) : page « Templates d'e-mail ».
- Raccourci **Modèles PDF** (`/pdf-templates`) : page « Modèles de documents PDF ».
- Raccourci **En-têtes et pieds de page** (`/template-blocks`) : page « En-têtes & pieds de page ».

## Prérequis
- Renseigner les **informations du cabinet** (nom, logo, couleurs, police, coordonnées) dans le menu du compte > **Cabinet** : les en-têtes, pieds de page et variables `{{cabinet.…}}` s'en servent.

## Modifier un modèle de mail — pas à pas
1. Ouvrez **Modèles**. À gauche, « Templates disponibles », rangés par destinataire (**Client**, **Collaborateur**, **Mixte**) avec leur catégorie (Authentification, Dossiers, Audiences, Facturation, Général). Un cadenas **Système** signale les modèles intégrés.
2. Cliquez un modèle. Modifiez le **Sujet**, le **Destinataire**, la **Police**, l'**En‑tête**, le **Pied de page** (« Par défaut » = bloc par défaut) et le **Corps du message** dans l'éditeur. Cochez ou décochez **Actif**.
3. Insérez des **variables** entre doubles accolades, par exemple `{{client.nom}}`, `{{dossier.numero}}`, `{{facture.…}}`, `{{audience.…}}`. Les familles disponibles : cabinet, dossier, client, facture, paiement, audience, diligence, action, document, rdv, date. Les variables inconnues apparaissent en jaune dans l'aperçu.
4. **Prévisualiser** (aperçu avec données d'exemple et l'en-tête/pied de page de votre cabinet), puis **Enregistrer** (« Template enregistré »).

## Modifier un modèle PDF
1. **Modèles PDF** : liste « Modèles disponibles » par type de document (Factures, Dossiers, Clients, Audiences, Diligences, Général) et par **variante** (Standard, Comptable, Client, Interne). Exemples : Facture – Standard, Facture – Version client, Facture – Relance de paiement, Dossier – Fiche complète, Client – Attestation de suivi, Audience – Compte-rendu, Diligence – Rapport.
2. Réglez le **Nom**, le **Titre du document** (ex. FACTURE), la **Variante**, l'**Orientation** (Portrait, Paysage), le **Format** (A4, A5…), la **Police**, l'**En‑tête**, le **Pied de page**, et le **Contenu du modèle** avec ses variables `{{…}}`.
3. **Prévisualiser**, puis **Enregistrer** (« Modèle enregistré »).
4. Les modèles servent ensuite quand vous cliquez **Exporter** ou **Télécharger** sur une fiche (facture, dossier, client, audience, diligence) : un choix de modèle, filtré selon vos droits, vous est proposé.

## Créer ou modifier un en-tête / pied de page
1. **En-têtes et pieds de page > Nouveau** (liste « Blocs », rangés par canal **E-mail** ou **PDF**).
2. Renseignez **Nom**, **Code** (facultatif, généré si vide), **Canal** (E-mail ou PDF), **Nature** (En-tête ou Pied de page), **Bloc par défaut du couple**, **Contenu**. Nom et contenu sont obligatoires (« Nom et contenu requis »).
3. **Prévisualiser**, puis **Enregistrer** (« Bloc créé » / « Bloc enregistré »).

## Règles
- Les modèles et blocs **système** ne se suppriment pas : **Désactiver** (ou supprimer) les rend simplement inactifs, et leur code (ainsi que le canal et la nature d'un bloc) reste figé. Un modèle de mail système ne peut pas être supprimé, seulement modifié.
- Il n'y a qu'**un seul bloc par défaut** par couple (canal, nature) : en cocher un retire le statut aux autres.
- Un modèle de mail **inactif** n'est plus utilisé à l'envoi (« Template … indisponible »).
- La page des modèles de mails ne propose pas de bouton de création : on modifie les modèles existants.

## Erreurs fréquentes
- « Enregistrement impossible » / « Prévisualisation impossible » → vérifiez le contenu et les variables.
- Une variable s'affiche telle quelle ou en jaune → son nom n'existe pas ; reprenez le catalogue des variables.
- Menu absent → ces pages sont réservées à l'administrateur.
- Logo ou couleurs absents des documents → complétez d'abord les paramètres du cabinet.

## Créer depuis le chat
La rédaction des modèles se fait dans ces pages, pas depuis le chat. Pour envoyer un message à un client, utilisez le menu **Messages** (le compositeur propose les modèles actifs).
