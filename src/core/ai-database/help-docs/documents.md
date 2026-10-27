---
id: documents
title: Documents
keywords: document, documents, plusieurs documents, rediger un document, pour preparer l'audience, lie a une audience, document apres l'audience, avant l'audience, piece pour l'audience, documents d'une audience, nouveau document, ajouter un document, uploader un document, televerser un document, piece jointe, pieces du dossier, gestion des documents, type de document, types de documents, nature du document, categorie de document, categories de documents, referentiels documents, telecharger un document, archiver un document, mots-cles du document, confidentialite, stockage, espace de stockage, ged
paths: /documents, /categories
---

# Documents

## À quoi ça sert
Le module Documents conserve les **pièces et fichiers** du cabinet (contrats, conclusions, jugements, pièces d'identité, courriers…), toujours rattachés à un **dossier** — et, par lui, à un client. Chaque document est classé par **catégorie** et par **nature** (type), et peut être rattaché à une **étape** ou **sous-étape** de la procédure du dossier.

## Où le trouver
- Menu **Documents** (`/documents`, section « Relation client », permission « voir les documents », module Documents inclus dans le plan d'abonnement) : liste avec statistiques, recherche et filtres. Bouton **Nouveau document**.
- Fiche d'un document (`/documents/<id>`) : onglets **Aperçu** (nom, statut, version, taille, type MIME, catégorie, confidentialité, dossier, client, dates, validité) et **Versions** (historique des fichiers).
- **Plus > Configuration > Référentiels documents** (`/documents/type`) : les **types de documents** (« Nouveau type de document »). Son raccourci **Catégories** (`/categories`) : les **catégories**.
- Les documents d'un dossier sont aussi visibles dans l'onglet documents de la fiche du dossier ; ceux d'un client sur sa fiche (onglet **Documents**).

## Prérequis
- Un **dossier** existant (le document y est rangé).
- (Facultatif mais recommandé) une **catégorie** et une **nature** de document, pour classer. Si elles sont absentes, le document est rangé dans « Documents non classés » / « Pièces diverses ».
- De l'**espace de stockage** disponible dans le plan d'abonnement.

## Ajouter un document — pas à pas
1. **Documents > Nouveau document**, ou **Ajouter un document** depuis la fiche du dossier (même formulaire, dossier déjà choisi). Le formulaire a deux blocs.
2. **Informations essentielles** : **Dossier** (absent si on vient du dossier), **Fichier**, **Note**, **Catégorie** et **Nature du document** (facultatives, listes avec recherche ; la nature est filtrée par la catégorie choisie), puis la case **Lié à une audience** (avec le choix de l'**Audience** du dossier et du **Moment** quand elle est cochée).
   - **Créer une catégorie ou une nature à la volée** : tapez son nom dans la liste, puis cliquez sur **+ Créer « nom »** ; elle est créée (code généré automatiquement) et sélectionnée aussitôt. Une nature créée alors qu'une catégorie est choisie lui est rattachée. Ce bouton n'apparaît qu'avec la permission de gérer les catégories (catégories) ou de créer un type de document (natures).
3. **Fichier** — deux façons :
   - **Importer un fichier** : glisser-déposer ou parcourir ; la carte du fichier permet l'aperçu (PDF, image), le remplacement et le retrait.
   - **Rédiger** : ouvre l'éditeur façon Word du cabinet (page A4, en-tête et pied de page du cabinet, mise en page). Si le plan inclut l'IA, une sélection peut être réécrite avec « Modifier avec l'IA ». **Valider** garde le texte dans le formulaire ; choisissez le format **Word** ou **PDF**. Le fichier n'est créé qu'à l'enregistrement du formulaire, et son titre sert de nom si le nom est vide.
4. **Informations complémentaires** : **Nom du document** (vide = titre de la rédaction ou nom du fichier), **Date du document**, **Mots-clés**, case **Document confidentiel**.
   La page **Modifier** d'un document utilise le même formulaire : un nouveau fichier ou une nouvelle rédaction en fait la version suivante.
5. **Plusieurs documents** : le bouton **Ajouter un document** de la barre du bas (à côté d'**Annuler** et de l'enregistrement) ajoute une fiche complète et indépendante (son fichier, son nom, sa note, son classement). Chaque fiche se replie. **Enregistrer les N documents** crée un document par fiche ; en cas d'échec, seules les fiches non enregistrées restent pour réessayer.
6. **Ajouter le document**. Un seul document ouvre sa fiche ; plusieurs ramènent à la page d'origine.

Champs obligatoires : **Dossier** et **Fichier** (plus **Nom** et **Note** dans le formulaire classique ; **Audience** si la case « Lié à une audience » est cochée). Taille maximale d'un envoi : 50 Mo.

## Documents liés à une audience
- La case **Lié à une audience** range le document dans les documents de l'audience choisie (elle doit appartenir au même dossier). Le choix **Moment** précise : **Préparation (avant l'audience)** — le document est alors marqué requis pour l'audience — ou **Après l'audience**. Le moment proposé est « après » si l'audience est passée ou tenue.
- Sur la fiche audience, deux cartes affichent ces documents : **Préparation de l'audience** et **Après l'audience** (qui regroupe aussi les pièces du compte rendu et de la décision).
- Depuis la fiche d'une audience, **Ajouter** (sur chaque carte) ou **Ajouter des documents** ouvre cette page avec le dossier, la case et l'audience déjà remplis et verrouillés, et le moment choisi (`?phase=after` pour « après »).
- Dans le chat : « Quelles pièces restent à préparer pour l'audience du 12 novembre ? » liste les documents rattachés à l'audience et marqués pour la préparer.

## Statuts et règles
- Statuts : **En attente**, **Validé**, **Rejeté**, **Expiré**, **Archivé**.
- Actions de la fiche : **Télécharger** (permission « télécharger un document »), **Modifier**, **Voir le fichier**, **Voir le dossier**, **Remettre en attente** (permission de rejeter), **Archiver** (permission d'archiver), **Supprimer** (permission de supprimer).
- Remplacer le fichier d'un document crée sa **version suivante** : le document garde sa fiche, l'ancien fichier est conservé dans l'onglet **Versions** (auteur, date, origine), où **Ouvrir** l'affiche et **Restaurer** en refait la version courante. Une modification faite avec l'IA (« Créer / modifier un document ») et classée depuis la carte crée aussi une version. Changer le statut ou la description ne change pas la version.
- Un type de document peut définir un **type de fichier accepté**, une **taille maximale**, une **durée de validité** et s'il est **obligatoire**.

## Les types de documents (Nature)
Formulaire « Nouveau type de document » : **Nom du document** (obligatoire), **Catégorie** (obligatoire), **Description**, **Document obligatoire**, **Durée de validité (jours)**, **Type de fichier accepté** (Images, PDF, Tous les documents, Aucune restriction), **Taille maximale (MB)**, **Statut**, **Types de clients associés** (documents exigés pour tel type de client).

## Les catégories
Formulaire catégorie : **Nom** (obligatoire), **Code** (facultatif), **Description**, **Icône**, **Couleur**, **Niveau de confidentialité** (Public, Interne, Confidentiel), **Ordre de tri**, **Période de rétention (jours)**, **Taille max. fichier (MB)**, **Catégorie active**.

## Automatismes
- Le fichier est rangé dans l'arborescence du cabinet : cabinet / numéro du dossier / catégorie / nature.
- Les collaborateurs du dossier sont notifiés des ajouts, modifications, archivages et suppressions.

## Erreurs fréquentes
- « Aucun fichier uploadé » → le fichier est obligatoire.
- « Espace de stockage insuffisant (… Go / … Go utilisés) » → quota de stockage du plan atteint (voir Abonnement).
- « Dossier … non trouvé » / « Type de document non trouvé » → choisissez un élément existant.
- Boutons absents → permissions de document insuffisantes (envoyer, modifier, télécharger, archiver, supprimer sont distinctes).

## Créer depuis le chat
Joignez le fichier à votre message et dites par exemple « Classe ce document dans le dossier DOS-2026-0039, nature Contrat ». L'application rattache le fichier joint : je ne peux pas créer de document sans fichier. Le document est analysé pour proposer nom et classement, puis une carte de confirmation s'affiche.
