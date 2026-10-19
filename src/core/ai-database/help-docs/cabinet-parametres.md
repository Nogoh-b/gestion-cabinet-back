---
id: cabinet-parametres
title: Paramètres du cabinet
keywords: parametres du cabinet, cabinet, informations du cabinet, nom du cabinet, logo du cabinet, changer le logo, devise du cabinet, numerotation des dossiers, format du numero, frais d'ouverture par defaut, apparence du cabinet, couleurs du cabinet, police du cabinet, theme du cabinet, langue du cabinet, fuseau horaire, parametres de la devise, symbole de la devise
paths: /settings/app
---

# Paramètres du cabinet

## À quoi ça sert
La page **Cabinet** (menu du compte, administrateur) définit l'**identité** du cabinet (nom, logo, couleurs — repris sur les e-mails, PDF et l'espace client) et ses **réglages métier** : devise, TVA par défaut, **numérotation** des factures et des dossiers, **frais d'ouverture** par défaut. Ces réglages alimentent ensuite tous les modules.

## Où le trouver
- Menu du compte (avatar) > **Cabinet** (`/settings/app`, administrateur uniquement) : page « Paramètres du Cabinet », organisée en blocs dépliables. Bouton d'enregistrement : « Paramètres du cabinet mis à jour ».

## Les réglages, bloc par bloc
1. **Logo du cabinet** : aperçu + **Changer le logo** (image ; reprise dans les en-têtes, e-mails et documents).
2. **Informations** : nom du cabinet, adresse, contacts, langue, fuseau horaire.
3. **Apparence** : couleurs, police, thème par défaut des nouveaux membres (chacun garde ensuite ses préférences personnelles).
4. **Configuration / Devise** : **devise** (XAF par défaut), **paramètres de la devise** (symbole, position du symbole, décimales, séparateur de milliers), format de date.
5. **TVA par défaut** : taux en % (ex. 19,25 pour le Cameroun, 0 si exonéré) — il initialise la TVA des nouveaux profils de facturation ; chaque dossier peut ensuite avoir sa propre TVA.
6. **Numérotation des factures** : modèle prêt à l'emploi (Préfixe + Année `FAC-2026-0001`, Année/Numéro, Numéro/Année, Mensuel) ou gabarit personnalisé avec jetons `{PREFIX}`, `{YYYY}`, `{MM}`, `{NNNN}` + **préfixe**, avec aperçu. Les numéros sont générés automatiquement : ne les saisissez jamais.
7. **Numérotation des dossiers** : même principe (jetons supplémentaires `{YY}`, `{DD}`), ex. `DOS-2026-0001`.
8. **Frais d'ouverture de dossier** : interrupteur, **montant HT**, **taux de TVA**, **libellé**. C'est le défaut du cabinet ; un montant saisi sur un dossier prime toujours.

## Règles
- Réservé à l'**administrateur** ; les autres rôles ne voient pas ce menu.
- Un changement de TVA, de devise ou de numérotation s'applique aux **nouveaux** éléments ; l'historique (factures émises, dossiers existants) n'est jamais réécrit.
- Le **mapping comptable par catégorie** (quel compte pour honoraires, vacations, frais…) n'a pas encore d'écran : à défaut tout va au 706 (voir « Comptabilité »).

## Erreurs fréquentes
- Menu Cabinet invisible → vous n'êtes pas administrateur.
- Logo ou couleurs absents des documents → complétez d'abord cette page, puis vérifiez Modèles > en-têtes et pieds de page.
- Numéro de facture ou de dossier en double → ne saisissez pas le numéro à la main : laissez le champ vide.

## Depuis le chat
Les paramètres du cabinet se règlent dans cette page, pas depuis le chat. Je peux en revanche vous dire où se règle chaque point et avec quel effet.
