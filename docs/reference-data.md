# Référentiels et configuration initiale

La console **Plateforme → Référentiels** gère les configurations des cabinets. Elle est disponible au propriétaire ; le support peut consulter et demander des explications à l’IA.

## Installation

1. Sauvegarder la base et livrer backend et frontend ensemble.
2. Exécuter `npm run migration:run` dans le backend avant de démarrer la nouvelle version.
3. Exécuter les compilations habituelles, puis démarrer l’application.
4. Le premier démarrage crée « Standard — Cameroun » depuis les définitions livrées, sans copier les personnalisations du cabinet 1. Les correspondances exactes des cabinets existants sont rattachées ; leurs valeurs métier ne sont pas réécrites.

La migration élargit les identifiants IAM et remplace l’ENUM du rôle utilisateur par un code validé dans le cabinet. Son retour arrière automatique est volontairement refusé : les anciens schémas ne peuvent pas représenter les rôles personnalisés. Utiliser une sauvegarde pour revenir à l’ancienne version.

## Pages dédiées

La vue d’ensemble ouvre les pages Rôles, Catalogue des permissions, Attributions aux rôles, Catalogue d’actions, Devises, Référentiels métier, Procédures, Modèles et Configuration initiale. Le profil sélectionné est conservé lors des déplacements. Sur mobile, un sélecteur remplace la navigation latérale.

Dans **Attributions aux rôles**, les cases représentent les droits copiés à l’initialisation des cabinets. Recherche, filtre par rôle ou fonctionnalité, copie d’un rôle vers un autre et aperçu des ajouts/retraits sont disponibles. L’enregistrement des rôles modifiés est atomique et refuse une version périmée. Ces choix remplacent les attributions codées dans les seeders pour les prochains cabinets du profil.

La **Configuration globale** rassemble les changements des différentes pages, montre leurs valeurs avant/après et vérifie les dépendances avant publication. Versions et Applications disposent aussi de leurs propres pages.

## Assistant contextuel

L’assistant utilise la page ouverte, les éléments choisis et les échanges précédents. Il recherche les éléments pertinents au-delà des premières lignes du catalogue et charge les dépendances, dont les permissions d’un rôle. Les sources sont consultables depuis ses réponses.

Les objectifs Expliquer, Préparer un changement et Comparer à un cabinet sont explicites. Le mode Expliquer reste en lecture seule même si le fournisseur renvoie des changements. Une demande ambiguë peut produire une question de précision. Les propositions affichent les différences lisibles, peuvent être affinées, et les propositions en attente sont reprises à la réouverture. L’acceptation enregistre uniquement le brouillon. Le support reste en lecture seule.

API supplémentaires :

- PUT /platform/reference-data/profiles/:id/role-permissions : attributions, identifiant de révision et version attendus.
- GET /platform/reference-data/profiles/:id/changes : changements depuis la publication.
- GET /platform/reference-data/profiles/:id/ai/pending : proposition valide de l’administrateur courant.
- La demande IA accepte les champs mode et selected_ids.

## Utilisation

- Dupliquer un profil, modifier les éléments et vérifier le brouillon.
- Publier pour rendre cette version disponible aux futurs cabinets. Le profil marqué « par défaut » est choisi si aucun profil n’est fourni à la création.
- Dans « Comparer et appliquer », choisir les cabinets et consulter les différences. Les personnalisations restent conservées sauf choix explicite de remplacement. Une procédure personnalisée est remplacée comme un graphe complet.
- Lancer l’application et consulter les résultats par cabinet. Un échec ne bloque pas les autres cabinets ; « Recomparer les cabinets en échec » prépare une nouvelle tentative.
- Une ancienne version publiée peut servir de source à un nouveau brouillon.
- L’assistant explique les éléments, prépare des propositions et cite leurs clés. Accepter une proposition modifie uniquement le brouillon. Publication et application restent distinctes.

Un rôle personnalisé possède un code et des permissions propres. Sa catégorie métier conserve les restrictions de visibilité existantes ; elle ne transmet jamais le contournement administrateur. Les codes `admin` et `client` restent protégés. Les nouveaux droits techniques ajoutés lors d’une évolution applicative sont proposés par le catalogue des capacités et doivent ensuite être ajoutés explicitement aux profils.

## Fonctionnement

- API plateforme : `/platform/reference-data/profiles`, révisions, éléments, validations, déploiements et assistant.
- API cabinet : `GET /reference-data/effective`, avec les devises et rôles réellement disponibles.
- Création d’un cabinet : `reference_profile_id` facultatif, version publiée figée au début de l’initialisation.
- Les versions et comparaisons volumineuses sont compressées en base ; l’API expose du JSON ordinaire.
- Les applications sont persistées en base et exécutées par le worker périodique Nest. Chaque cabinet utilise une transaction ; aucun processus externe ni Redis supplémentaire n’est requis.
- Le contrôle de concurrence refuse les brouillons et aperçus périmés. Les relances n’effacent pas une personnalisation.
- Les variables et conditions des modèles sont validées avec les catalogues des moteurs de rendu. Les blocs utilisent des liens résolus dans chaque cabinet.
- Les anciennes définitions d’actions, règles et graphes de procédure restent disponibles pour les dossiers historiques.
- Les consultations et démarrages ne relancent plus les anciens seeders sur les cabinets. Les commandes de synchronisation globale refusent désormais une application implicite.
- La géographie commune, les offres d’abonnement, les moyens de paiement et les secrets conservent leurs modules actuels.

## Vérifications

```text
npm run reference-data:check
npm run reference-data:test
npm test -- --runInBand --runTestsByPath src/modules/reference-data/reference-data.spec.ts src/modules/platform/reference-data/platform-reference-data.spec.ts src/modules/cabinet/tenant-seeder.service.spec.ts
```

Le test d’intégration crée une base locale temporaire `cabinet_reference_test_...`, puis la supprime dans son bloc de nettoyage. Il refuse un hôte distant et ne modifie pas la base `DB_NAME` de l’application. Il vérifie profils distincts, isolation, dépendances, historique, aperçu périmé, échec partiel, transaction annulée, reprise, rôles dynamiques, IA et migration.
