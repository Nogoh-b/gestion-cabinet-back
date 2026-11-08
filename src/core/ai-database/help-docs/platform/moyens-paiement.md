---
id: platform-moyens-paiement
title: Moyens de paiement
keywords: moyens de paiement, moyen de paiement, passerelle, cinetpay, notchpay, stripe, webhook, url de retour, sandbox, production, frais, cles de passerelle
paths: /platform/moyens-paiement
---

# Moyens de paiement

## À quoi ça sert
Moyens proposés aux cabinets pour régler leur abonnement. Les clés des passerelles sont chiffrées et ne sont jamais réaffichées.

## Configurer un moyen
Champs : **Code**, **Libellé affiché**, **Mode** (**Sandbox (tests)** ou **Production (encaissements réels)**), **Frais (%)**, **Frais fixes**, **Montant minimum**, **Ordre d'affichage**, et **Canaux CinetPay** pour cette passerelle.

La page affiche l'**URL de webhook** et l'**URL de retour** à recopier chez le fournisseur.

## Erreurs fréquentes
- Mode Sandbox laissé en production : aucun encaissement réel.
- URL de webhook non renseignée chez le fournisseur : les paiements restent en attente jusqu'à la relecture automatique.
