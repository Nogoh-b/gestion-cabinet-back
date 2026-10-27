# Fusion de `main` dans `feature/securisation-juridique-refonte`

Notes de la fusion du 27/10/2026. La base de données (`core_banking_mendo_2025_07`)
porte déjà les migrations des deux branches : le schéma de la refonte fait foi.

## Règles appliquées

- **Refonte prioritaire** : modèle de données, sécurité (cookies HttpOnly, contexte
  cabinet sans repli implicite, audit, outbox), cycles de vie (dossier, procédure,
  audience, facture, paiement, comptabilité, paie, fournisseurs, commissions,
  documents versionnés).
- **main prioritaire** : assistant IA et skills, chat, recherche, statistiques,
  notifications, abonnements/paiements en ligne (passerelles), workflow V2
  (case-workflow), portail client.
- **IA hybride** : l'IA de `main` est conservée, mais les tables à cycle de vie
  (`src/config/ai-database/ai-lifecycle-tables.config.ts`) refusent toute écriture
  générique ; seules les actions métier (qui passent par les services) y écrivent.
  Les handlers d'écriture IA des tables hors cycle de vie sont restaurés depuis
  `main` (collaborateurs, clients, plan comptable, journaux, diligences, types de
  procédure).

## Fonctionnalités de `main` non reportées (à reprendre)

- **Versions de documents (main)** : `main` avait son propre versionnage
  (`DocumentCustomerVersion` : historique, restauration, versions issues du studio
  IA). Les routes `/documents/:id/versions` sont celles de la refonte
  (`DocumentVersion` : validation, scan, rejet, révocation). Le service de `main`
  reste utilisable en interne (studio IA) mais n'est plus exposé : unifier les
  deux modèles.
- **Rappels de délais d'appel / de cassation (main)** : les colonnes
  `appeal_deadline` / `cassation_deadline` n'existent plus (la refonte gère les
  délais via `legal_deadlines` / `legal_deadline_rules`). Les rappels de recours
  du `ReminderScheduler` de `main` sont retirés ; à reconstruire sur les délais
  légaux de la refonte.
- **Encaissement réparti sur un dossier (main)** : `POST /paiements/dossier/:id/encaissements`
  (ventilation d'un montant sur plusieurs factures + avoir de trop-perçu) écrivait
  directement des paiements validés et modifiait le statut des factures. Il n'est
  pas reporté : à reconstruire sur les commandes de paiement de la refonte
  (création, preuve, validation, outbox).
- **Avoirs** : deux liens coexistent sur `factures` (`original_invoice_id` de la
  refonte, `original_facture_id` de main). Unifier.
- **Export ZIP des dossiers (main)** : la version de la refonte est conservée
  (politique d'accès, audit, manifeste). Le masquage des champs restreints
  (`redactRestrictedFields`, factures masquées sans droit) et la portée par rôle
  ajoutés par main dans l'export ne sont pas reportés.
