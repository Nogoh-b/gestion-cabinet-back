---
id: cabinet-parametres
title: Paramètres du cabinet
keywords: parametres du cabinet, cabinet, informations du cabinet, nom du cabinet, logo du cabinet, changer le logo, devise du cabinet, numerotation des dossiers, format du numero, frais d'ouverture par defaut, apparence du cabinet, couleurs du cabinet, police du cabinet, theme du cabinet, langue du cabinet, fuseau horaire, parametres de la devise, symbole de la devise, horaires d'ouverture, informations legales
paths: /settings/app
---

# Paramètres du cabinet

## À quoi ça sert
La page **Cabinet** (menu du compte, administrateur) définit l'**identité** du cabinet (nom, logo, couleurs — repris sur les e-mails, PDF et l'espace client) et ses **réglages métier** : devise, TVA par défaut, **numérotation** des factures et des dossiers, **frais d'ouverture** par défaut. Ces réglages alimentent ensuite tous les modules.

## Où le trouver
- Menu du compte (avatar) > **Cabinet** (`/settings/app`, administrateur uniquement) : page « Paramètres du Cabinet », organisée en blocs dépliables. Bouton d'enregistrement : « Paramètres du cabinet mis à jour ».

## Les réglages, bloc par bloc
1. **Logo du cabinet** : aperçu + **Changer le logo** (image ; reprise dans les en-têtes, e-mails et documents).
2. **Identité** : **Nom du cabinet**, **Slogan / Devise**, **Téléphone**, **Email**, **Site web**, **Adresse**.
3. **Apparence par défaut des nouveaux membres** : couleur, polices, taille du texte et barre latérale attribuées à chaque nouveau membre (chacun peut ensuite personnaliser ; les membres existants ne sont pas modifiés).
4. **Informations légales** : **RCCM**, **NINA**, **Compte bancaire** (IBAN / RIB).
5. **Configuration** : **Langue** (Français / English), **Devise** (XAF par défaut), **Format de date** (31/12/2024, 12/31/2024 ou 2024-12-31).
6. **Numérotation des factures** : modèle prêt à l'emploi (Préfixe + Année `FAC-2026-0001`, Année/Numéro, Numéro/Année, Mensuel) ou gabarit personnalisé avec jetons `{PREFIX}`, `{YYYY}`, `{MM}`, `{NNNN}` + **préfixe**, avec aperçu. Les numéros sont générés automatiquement : ne les saisissez jamais.
7. **Numérotation des dossiers** : même principe (jetons supplémentaires `{YY}`, `{DD}`), ex. `DOS-2026-0001`.
8. **TVA par défaut** : taux en % (ex. 19,25 pour le Cameroun, 0 si exonéré) — il initialise la TVA des nouveaux profils de facturation ; chaque dossier peut ensuite avoir sa propre TVA.
9. **Horaires d'ouverture** : **Heure d'ouverture** et **Heure de fermeture** (sélecteurs d'heure).
10. **Frais d'ouverture de dossier** : interrupteur, **montant HT**, **taux de TVA**, **libellé**. C'est le défaut du cabinet ; un montant saisi sur un dossier prime toujours.
11. **Paramètres de la devise** : **symbole**, **position du symbole**, **décimales**, **séparateurs** (milliers, décimal) — repris automatiquement au choix de la devise.

## Règles
- Réservé à l'**administrateur** ; les autres rôles ne voient pas ce menu.
- Un changement de TVA, de devise ou de numérotation s'applique aux **nouveaux** éléments ; l'historique (factures émises, dossiers existants) n'est jamais réécrit.
- Le **mapping comptable par catégorie** (quel compte pour honoraires, vacations, frais…) n'a pas encore d'écran : à défaut tout va au 706 (voir « Comptabilité »).

## Erreurs fréquentes
- Menu Cabinet invisible → vous n'êtes pas administrateur.
- Logo ou couleurs absents des documents → complétez d'abord cette page, puis vérifiez Modèles > en-têtes et pieds de page.
- Numéro de facture ou de dossier en double → ne saisissez pas le numéro à la main : laissez le champ vide.

## Depuis le chat
- **Lire** : tout collaborateur peut demander une information du cabinet (« Quel est le RCCM du cabinet ? », « Quelle est notre devise ? », « Quels sont nos horaires ? »). Mentionnez `@cabinet` pour viser directement la fiche du cabinet.
- **Modifier** : avec le droit « Gérer les paramètres » (`manage_settings`), demandez par exemple « Change l'adresse du cabinet en … » ou « Passe la TVA par défaut à 19,25 ». Une carte de confirmation montre chaque champ **avant / après** ; rien n'est enregistré sans votre confirmation. Sans ce droit, la modification est refusée.
- Modifiables depuis le chat : identité (nom, slogan, téléphone, e-mail, site, adresse, pied de page des e-mails, couleur), informations légales (RCCM, NINA, compte bancaire), langue, format de date, devise et ses paramètres, TVA par défaut, numérotation, horaires, notifications et frais d'ouverture.
- Restent dans cette page : le **logo**, l'**apparence par défaut**, la **configuration SMTP** et les **gabarits**. Le chat ne lit jamais la configuration SMTP ni les clés des fournisseurs IA.
- Seul votre cabinet est concerné : le chat ne crée ni ne supprime de cabinet et ne voit pas les autres cabinets.
