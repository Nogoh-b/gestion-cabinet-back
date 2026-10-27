---
id: employes
title: Employés (collaborateurs)
keywords: employe, employes, collaborateur, collaborateurs, gestion des employes, nouvel employe, creer un employe, ajouter un employe, ajouter un collaborateur, fiche employe, membre, membres, equipe, profil d'acces, poste, salaire mensuel, taux horaire, conge, permission, bloquer l'acces, debloquer l'acces, identifiants, avocat du cabinet, embauche, agence de rattachement, capacite, disponible
paths: /gestion-cabinet/employees, /membres
---

# Employés (collaborateurs)

## À quoi ça sert
La fiche employé (aussi appelée **collaborateur** ou **membre**) représente chaque personne du cabinet : avocats, juristes, secrétaires, comptables, stagiaires, huissiers, personnel de support, apporteurs d'affaires. Elle sert à :
- créer le **compte de connexion** de la personne, avec son **profil d'accès** (permissions) ;
- choisir l'**avocat responsable** et les **collaborateurs** des dossiers ;
- porter le **salaire mensuel** (base de la paie) et le **taux horaire** (base de la facturation au temps passé) ;
- suivre la disponibilité, la charge de dossiers, les permissions (congés) et les avances.

**Processus en bref :** **Nouvel employé** (identité, e-mail, fonction, salaire) → compte créé, identifiants envoyés par e-mail → affectation aux dossiers (responsable / collaborateur) → salaire repris par la paie, taux horaire repris par la facturation.

## Où le trouver
- Menu **Gestion des employés** (section « Cabinet » de la barre latérale, `/gestion-cabinet/employees`, permission « voir les utilisateurs »).
- Bouton **Nouvel employé** : formulaire de création (`/gestion-cabinet/employees/nouveau`).
- Fiche détail d'un employé : onglets **Aperçu, Dossiers, Présence, Tarifs, Communication, Avances sur salaire, Audit**.
- Référentiels liés : Agences (bureaux) et Rôles & Permissions (menu du compte > Rôles & Permissions, administrateur).

## Prérequis
- Une **adresse e-mail** pour la personne : elle devient l'identifiant de connexion et reçoit les identifiants.
- (Recommandé) Une **agence** de rattachement (créable depuis le formulaire).
- Un **profil d'accès** existant et actif ; par défaut il est déduit du poste. Le rôle « client » est réservé au portail client.
- Le **quota d'employés** du plan d'abonnement ne doit pas être atteint.
- Pour la paie : renseigner le **salaire mensuel** (visible seulement avec la permission financière correspondante).

## Créer un employé — pas à pas
1. **Gestion des employés > Nouvel employé**.
2. **Identité** : nom complet, date de naissance, lieu de naissance.
3. **Coordonnées** : adresse personnelle (ville), téléphone personnel, **e-mail**.
4. **Poste et rémunération** : **Fonction** (Avocat, Collaborateur, Juriste, Comptable, Secrétaire, Assistant, Stagiaire, Huissier, Administratif, Personnel de support, Apporteur d'affaire), **Profil d'accès** (laissé vide, il est déduit de la fonction ; modifiable par un administrateur), **Agence de rattachement**, **date d'embauche**, **salaire**.
5. **Situation familiale** : statut social et nombre d'enfants (alimentent le calcul des charges sociales de la paie).
6. **Compétences et bureau** (facultatif, complétable plus tard) : spécialisation, années d'expérience, numéro et ville du barreau, **taux horaire facturé**, téléphone et adresse professionnels.
7. Enregistrez : « Collaborateur créé. Ses identifiants lui ont été envoyés. » Un mot de passe temporaire est envoyé par e-mail ; la personne doit le changer à la première connexion.

Champs obligatoires : nom et prénom, date et lieu de naissance, ville/adresse personnelle, téléphone, date d'embauche, salaire, statut social, nombre d'enfants, fonction, et l'e-mail.

Correspondance fonction → profil d'accès par défaut : Avocat → Avocat ; Collaborateur, Juriste, Assistant → Collaborateur ; Comptable → Comptable ; Secrétaire, Administratif → Secrétaire ; Stagiaire → Stagiaire ; Huissier → Huissier ; Personnel de support → Support ; Apporteur d'affaire → Apporteur d'affaire.

## La fiche employé
- **Statut** : Actif, Inactif, En congé, En formation, Arrêt maladie. **Disponible** = accepte de nouveaux dossiers ; **Dossiers max** = capacité simultanée (la fiche affiche dossiers actuels, charge, « peut accepter plus »).
- Niveau d'expérience (Junior, Confirmé, Senior, Expert), domaines d'expertise, langues parlées.
- **Actions** : Modifier, Fiche simplifiée, Exporter, Contacter par e-mail, Appeler, Voir les dossiers, Voir la branche, **Bloquer / Débloquer l'accès**, **Marquer disponible / indisponible**, Supprimer.
- **Demandes du collaborateur** (permissions/congés et avances) : le collaborateur les saisit depuis « Mes demandes » ; l'administrateur les **valide, refuse ou annule** depuis la fiche (motif obligatoire pour un refus ou une annulation) et peut ajuster les dates d'une permission ou le montant d'une avance avant de la valider.

## Lien avec les autres modules
- **Dossiers** : l'employé peut être avocat responsable ou collaborateur d'un dossier.
- **Facturation** : le taux horaire sert quand une facturation est « au temps passé ».
- **Paie** : le salaire mensuel alimente la génération des bulletins ; seuls les employés **actifs avec salaire** sont inclus.
- **Rôles & Permissions** : le profil d'accès décide des menus et actions visibles.

## Erreurs fréquentes
- « Un utilisateur avec cet email existe déjà » → l'adresse est déjà utilisée.
- « Profil d'accès inexistant ou inactif dans ce cabinet » → choisissez un profil valide.
- Quota d'employés dépassé → augmentez l'abonnement.
- Salaire ou taux horaire invisible → permissions financières manquantes.

## Exemple : embaucher une juriste
1. **Gestion des employés > Nouvel employé** : Aïcha Bello, née le 12/04/1994 à Garoua, e-mail aicha.bello@cabinet.cm, téléphone, ville.
2. **Fonction** Juriste (profil d'accès **Collaborateur** déduit), agence Douala, embauche 01/04/2026, **salaire** 400 000 FCFA, statut social et enfants.
3. Enregistrez : « Collaborateur créé. Ses identifiants lui ont été envoyés. » — elle changera son mot de passe à la première connexion.
4. Affectez-la comme **collaboratrice** de 2 dossiers ; son **taux horaire** (renseigné plus tard) servira aux vacations.
5. À la paie d'avril : active avec salaire → bulletin généré automatiquement.

## Créer depuis le chat
« Ajoute un employé : Sophie Martin, avocate, e-mail sophie.martin@cabinet.cm, téléphone +237 690 00 00 00, embauchée le 1er septembre 2026, salaire 350 000 FCFA. » Une carte de confirmation modifiable s'affiche. L'e-mail d'identifiants n'est envoyé qu'une fois la création confirmée.
