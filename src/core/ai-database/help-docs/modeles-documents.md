---
id: modeles-documents
title: Modèles de mails, de PDF et en-têtes / pieds de page
keywords: creer un modele avec l ia, generer un modele, modele de contrat, modele word, modele de mail, modeles de mail, modeles de mails, template de mail, templates de mail, templates d'e-mail, modele d'e-mail, modele pdf, modeles pdf, modeles de documents pdf, modele de facture, personnaliser la facture, personnaliser un document, en-tete, en-tetes, pied de page, pieds de page, en-tetes et pieds de page, bloc d'en-tete, variables de modele, variable dans un mail, apercu du modele, logo du document, modele systeme, police du modele, mail d activation, mail d'activation, activation de compte, mail de bienvenue, mail de reinitialisation, reinitialisation du mot de passe, ouverture de compte, e-mails automatiques, mails automatiques, modifier le mail, texte du mail
paths: /mail-templates, /pdf-templates, /template-blocks
---

# Modèles de mails, de PDF et en-têtes / pieds de page

## À quoi ça sert
Ce module personnalise l'**apparence et le texte** de tout ce que le cabinet envoie ou imprime :
- les **modèles de mails** : e-mails automatiques (catégorie Authentification : Ouverture de compte, Activation de compte, Bienvenue cabinet, Identifiants collaborateur, Code de vérification, Réinitialisation du mot de passe, Mot de passe modifié ; notifications) et modèles proposés dans la rédaction d'un message (suivi de dossier, envoi de facture, relance de paiement, convocation à une audience, rappel d'audience, partage de document, clôture de dossier, confirmation de rendez-vous…) ;
- les **modèles PDF** : factures, fiches dossier, fiches client, attestations, comptes-rendus d'audience, ordres de mission et rapports de diligence ;
- les **en-têtes et pieds de page** : blocs réutilisables (logo, coordonnées du cabinet…) greffés sur les modèles de mails ou de PDF.

## Où le trouver
Réservé à l'**administrateur**. Menu **Plus > Configuration > Modèles** :
- **Modèles** (`/mail-templates`) : page « Templates d'e-mail ».
- Raccourci **Modèles de documents** (`/pdf-templates`) : page « Modèles de documents ».
- Raccourci **En-têtes et pieds de page** (`/template-blocks`) : page « En-têtes & pieds de page ».

## Prérequis
- Renseigner les **informations du cabinet** (nom, logo, couleurs, police, coordonnées) dans le menu du compte > **Cabinet** : les en-têtes, pieds de page et variables `{{cabinet.…}}` s'en servent.

## Modifier un modèle de mail — pas à pas
1. Ouvrez **Modèles**. À gauche, « Templates disponibles », rangés par destinataire (**Client**, **Collaborateur**, **Mixte**) avec leur catégorie (Authentification, Dossiers, Audiences, Facturation, Général). Un cadenas **Système** signale les modèles intégrés.
2. Cliquez un modèle. Modifiez le **Sujet**, le **Destinataire**, la **Police**, l'**En‑tête**, le **Pied de page** (« Par défaut » = bloc par défaut) et le **Corps du message** dans l'éditeur. Cochez ou décochez **Actif**.
3. Insérez des **variables** entre doubles accolades, par exemple `{{client.nom}}`, `{{dossier.numero}}`, `{{facture.…}}`, `{{audience.…}}`. Les familles disponibles : cabinet, dossier, client, facture, paiement, audience, diligence, action, document, rdv, date. Les variables inconnues apparaissent en jaune dans l'aperçu.
4. **Prévisualiser** (aperçu avec données d'exemple et l'en-tête/pied de page de votre cabinet), puis **Enregistrer** (« Template enregistré »).

## Modifier un modèle PDF
1. **Modèles de documents** : liste « Modèles disponibles » par type de document (Factures, Dossiers, Clients, Audiences, Diligences, Général) et par **variante** (Standard, Comptable, Client, Interne). Exemples : Facture – Standard, Facture – Version client, Facture – Relance de paiement, Dossier – Fiche complète, Client – Attestation de suivi, Audience – Compte-rendu, Diligence – Rapport.
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

## Créer ou utiliser un modèle PDF avec l'IA
- **Créer avec l'IA** (en haut de la page Modèles de documents), ou la compétence **Créer / modifier un document** du chat (**#**, « crée un modèle de… ») : décrivez le modèle (« contrat de bail commercial ») ou joignez un document existant à transformer. L'IA écrit le texte type et remplace les informations propres à chaque affaire par des champs `{{…}}` (ceux de la fiche choisie se remplissent seuls). Vérifiez-le dans la carte (champs surlignés, éditeur plein écran), puis **Enregistrer dans mes modèles** (droit « Créer un modèle PDF »).
- **Générer un document avec l'IA** (sous un modèle ouvert), ou la compétence **Créer / modifier un document** (« attestation de suivi pour @client ») : mentionnez le dossier ou le client avec **@** ; la fiche remplit ses champs, l'IA remplit les autres d'après les pièces du dossier et vos fichiers joints. Vous obtenez l'aperçu, le **Word** et le **PDF**.
- Les modèles créés par vous ou par l'IA peuvent être **supprimés** (bouton Supprimer) ; les modèles système se désactivent seulement.
- Les modèles de mails, les modèles de documents et les blocs (en-tête, pied de page) se modifient dans leur page, ou depuis le chat avec la compétence **Modèles (mails et PDF)** : « modifie le mail d'activation de compte : … », « modifier le modèle « Audience — Compte-rendu » ajoute une phrase de politesse à la fin » (le modèle est retrouvé par son nom, sans préciser s'il s'agit d'un mail ou d'un document). Le chat affiche une **carte** avec l'**Aperçu** (données d'exemple, en-tête et pied de page du cabinet) et l'onglet **Modifier** (nom, objet du mail ou titre du document, éditeur du contenu) ; rien n'est enregistré avant **Enregistrer le modèle**, même pour un simple renommage ou une désactivation (rappelés dans la carte). Pour une retouche, utilisez **Demander une modification à l'IA** en bas de la carte, ou tapez-la dans le chat (« plus court », « change la couleur du bouton ») : elle part de la version affichée dans la carte. **Version enregistrée** annule les changements de la carte. En plein écran, l'éditeur et l'aperçu sont côte à côte.
- « crée un modèle de mail : diligence pour client » : l'IA rédige le modèle avec les variables du catalogue et l'affiche dans la même carte (nom, code, catégorie et destinataire modifiables) ; il n'est créé qu'avec **Créer le modèle**. Un code déjà pris reçoit un suffixe (`_2`). Pour envoyer un message à un client, utilisez le menu **Messages** (le compositeur propose les modèles actifs).
