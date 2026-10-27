---
id: competences-facturation
title: Compétences « Facturation » (configurer la facturation d'un dossier, devis d'honoraires)
keywords: devis, devis d'honoraires, faire un devis, etablir un devis, devis du dossier, devis word, devis pdf, proposition d'honoraires, estimation des honoraires, configurer la facturation depuis le chat, configurer la facturation avec l'ia, proposer la facturation, appliquer la facturation proposee, facturation proposee par l'ia, competence configurer la facturation, competence devis
paths: /chat
---

# Compétences « Facturation »

## Configurer la facturation
- **Pour quoi** : régler le profil de facturation d'un dossier (le même que l'onglet **Facturation** du dossier) à partir de votre consigne et des pièces : « configure la facturation de @DOS-… : forfait de 500 000 FCFA, frais d'ouverture 50 000 inclus, 10 % du montant recouvré ».
- **Ce que lit l'IA** : le dossier (objet, procédure, juridiction, parties, budget estimé), son profil de facturation actuel, la TVA du cabinet, les **tarifs du catalogue d'actions**, jusqu'à 8 pièces non confidentielles du dossier (convention d'honoraires, lettre de mission…), les fichiers joints au chat et la base juridique. Aucun montant n'est inventé : un montant inconnu reste vide et apparaît dans « À vérifier ».
- **La réponse** : le profil proposé (mode, forfait, taux horaire, pourcentage, frais d'ouverture, vacation, honoraire de résultat, refacturation des frais, TVA), le **tableau du devis** (HT, TVA, TTC), la justification et les pièces lues.
- **La carte à confirmer** : chaque champ est modifiable (mode et oui/non en listes). L'aperçu rappelle la facturation actuelle. **Confirmer** applique la configuration comme l'onglet Facturation : le forfait et les frais d'ouverture à facturer, et les factures **brouillon** du dossier, suivent ; une facture déjà émise ne change pas (avoir ou facture complémentaire à faire, signalé dans le bilan).
- **Étape suivante** : **Générer le devis (Word / PDF)**.
- Droit requis : **gérer les éléments facturables**.

## Devis d'honoraires
- « Fais le devis d'honoraires de @DOS-… » (ou le bouton après la configuration) : même lecture du dossier et des pièces, puis un **devis** dans la carte studio : client, dossier, date, validité, tableau des prestations (quantité, prix unitaire, montant HT), totaux HT / TVA / TTC, modalités de facturation, conditions, signature et « Bon pour accord ».
- La carte permet la relecture, l'éditeur plein écran (couleurs, mise en forme), **Word**, **PDF**, le **classement dans le dossier** et l'**envoi par e-mail**.
- **Étape suivante** : **Appliquer cette facturation au dossier** (carte à confirmer).
- Le devis est un document : il n'est pas enregistré comme une facture. Droit requis : voir les dossiers.

## Erreurs fréquentes
- « Mentionnez le dossier » → la compétence vise un dossier : mentionnez-le avec **@** ou ouvrez sa fiche.
- « Aucun montant n'a pu être établi » → précisez les honoraires (forfait, taux horaire, frais d'ouverture…) dans la demande, ou joignez la convention d'honoraires.
- « Le profil de facturation a été modifié » → quelqu'un l'a changé entre-temps : relancez la compétence.
