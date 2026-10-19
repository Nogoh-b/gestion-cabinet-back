---
id: import-export
title: Exports, impressions et PDF
keywords: exporter, export, exportation, imprimer, impression, pdf, telecharger un pdf, telecharger, export comptable, export client, export des audiences, rapport pdf, rapport excel, export csv, dossier zip, archiver un dossier en zip, exporter la liste, fiche pdf, attestation
paths: /rapports, /facturation/factures, /audiences, /dossiers
---

# Exports, impressions et PDF

## À quoi ça sert
Chaque module permet de **sortir** ses données : **PDF** mis en page (facture, fiche dossier, fiche client, compte-rendu d'audience, rapport de diligence, bulletin de paie, récapitulatif de clôture), **impression**, **exports de listes** (audiences d'une période, rapports) et **exports comptables**. Il n'y a en revanche **pas d'import en masse** : les données se créent dans les formulaires (avec aide à la saisie IA) ou depuis le chat.

## Où trouver les boutons
- **Facture** (fiche) : **Exporter**, **Imprimer**, **PDF Facture** (document standard) ou PDF personnalisé (vos modèles PDF, filtrés selon vos droits), **Export comptable** (écritures liées), **Export client**.
- **Dossier** (fiche) : **Exporter** — archive **ZIP** (fiche, documents, audiences, diligences selon vos droits ; un avocat n'exporte que ses dossiers, sans les montants financiers s'il n'y a pas droit ; « Aucun dossier accessible pour cet export » sinon). À la clôture : récapitulatif de clôture **PDF archivé** dans le dossier.
- **Audiences** (liste) : **export des audiences d'une période** (choix de la période).
- **Clients, Employés, Apporteurs, Juridictions, Agences** (fiches) : **Exporter** (fiche, attestation selon vos droits).
- **Diligence** (fiche) : **Télécharger** (actif une fois le **rapport généré** via **Générer rapport**).
- **Bulletin de paie** (fiche) : **Télécharger PDF**.
- **Statistiques** (`/rapports`) : **Exporter** — **PDF** (rapport mis en page) ou **Excel** (fichier CSV lisible dans Excel, nommé `rapport-<début>_<fin>`).
- **Sauvegarde** (Administration) : **Télécharger** une copie de la sauvegarde.

## Personnaliser les documents
- L'apparence (nom, logo, couleurs, coordonnées du cabinet) vient de menu du compte > **Cabinet**.
- Les **modèles PDF**, **modèles de mails** et **en-têtes / pieds de page** se règlent dans Plus > Configuration > **Modèles** (administrateur) : variantes Standard, Comptable, Client, Interne ; variables `{{…}}` ; **Prévisualiser** puis **Enregistrer**. Voir « Modèles ».
- Au moment d'exporter, un **choix de modèle** filtré selon vos droits est proposé.

## Règles
- Un export ne montre que ce que votre rôle peut voir (dossiers confidentiels, montants financiers et salaires exclus sans les droits).
- Un PDF généré est une **photo** à un instant : réexportez après toute modification.
- L'export comptable d'une facture n'existe qu'une fois la facture **émise** (brouillon = aucun effet comptable).

## Erreurs fréquentes
- Bouton Exporter absent → permission de voir ou d'exporter manquante, ou module non inclus dans le plan.
- « Aucun dossier accessible pour cet export » → vous n'avez accès à aucun des dossiers demandés.
- Logo ou couleurs absents du PDF → complétez menu du compte > Cabinet, puis vérifiez le modèle utilisé.
- Modèle proposé inadapté (comptable au lieu de client) → choisissez la variante dans la liste, ou faites ajuster les modèles (administrateur).

## Depuis le chat
Je ne génère pas directement de PDF depuis le chat : préparez la donnée avec moi (facture, bulletin, diligence…), puis cliquez **Exporter / Télécharger / PDF** sur la fiche. Pour un chiffre ou une liste, demandez-le-moi directement : je l'affiche dans la conversation.
