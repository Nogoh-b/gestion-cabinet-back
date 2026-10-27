# Exemples de texte pour créer des ressources via le chat IA

Ce document rassemble des exemples de messages en langage naturel à taper dans le chat
de l'assistant (`ai-database`) pour créer des ressources dans le système de gestion du
cabinet. Il est construit à partir des entités réelles (`@BusinessTable` / `@BusinessColumn`)
et des handlers d'écriture (`dossier-write.handler.ts`, `facture-write.handler.ts`,
`base-write-handler.ts`, `generic-write.service.ts`).

## Principes à connaître avant de rédiger un message

- **Les numéros sont automatiques.** `dossier_number` (format `DOS-YYYY-XXXX`) et `numero`
  de facture sont générés par le système — ne jamais les inventer dans le texte.
- **Les relations se donnent par leur nom, pas par leur ID.** Le moteur résout tout seul :
  - `client` → nom/prénom ou raison sociale du client
  - `lawyer` → nom de l'avocat
  - `procedure_type` / `procedure_subtype` → nom exact ou approché du type de procédure
  - `jurisdiction` → nom du tribunal
  - `dossier` → numéro `DOS-...` (le client est hérité automatiquement du dossier pour les factures)
- **Les statuts/énumérations peuvent être écrits en toutes lettres** ("urgence élevée",
  "facture payée", "diligence terminée") — le LLM les convertit vers les codes BD listés
  dans l'aide-mémoire en fin de document.
- **Les dates** peuvent être relatives ("aujourd'hui", "dans 30 jours", "le 15 juillet 2026")
  ou absolues (`AAAA-MM-JJ`).
- **La création en cascade fonctionne dans un seul message** : on peut créer un dossier
  et, dans la même phrase, une facture/audience/diligence qui s'y rattache — le moteur
  relie automatiquement les enregistrements créés dans la même requête.
- **Un client inconnu peut être créé à la volée** en même temps qu'un dossier, si son nom
  ne correspond à personne dans la base.

---

## 1. Client (`Customer`)

1. Crée un nouveau client particulier : Jean Dupont, adresse 12 rue de la Réunification,
   Douala, téléphone 699112233, email jdupont@gmail.com.
2. Ajoute un client professionnel : SARL Konan Frères, société commerciale basée à
   Yaoundé, RCCM RC/YAO/2020/B/1452, facturation au forfait.
3. Enregistre une nouvelle cliente : Awa Mballa, particulière, résidant à Bafoussam,
   téléphone 677889900.
4. Crée le client SA Total Cameroun, entreprise, siège à Douala-Akwa, NUI M012345678901,
   facturation au temps passé.
5. Ajoute un client : Paul Ngassa, profession commerçant, adresse Marché Central,
   Bafoussam, code postal 00237, pays Cameroun.
6. Crée une cliente professionnelle : Établissements Fotso & Fils, secteur BTP,
   téléphone professionnel 233421100, email contact@fotsoetfils.cm.

---

## 2. Dossier contentieux (`Dossier`)

1. Ouvre un dossier pour le client Jean Dupont, avocat responsable Maître Ngono,
   procédure "Contentieux civil - Procédure ordinaire", objet : litige commercial avec la
   SARL Konan pour non-paiement de factures d'un montant de 3 500 000 FCFA, tribunal de
   première instance de Douala, niveau d'urgence élevé, date d'ouverture aujourd'hui.
2. Crée un dossier de divorce contentieux pour la cliente Awa Mballa, avocat Maître
   Fotso, tribunal de grande instance de Yaoundé, partie adverse Paul Mballa, priorité
   normale.
3. Ouvre un dossier "Injonction de payer" pour le client SA Total Cameroun contre la
   société Distribution Sahel SARL, montant réclamé 8 200 000 FCFA, avocat Maître Ngono,
   tribunal de commerce de Douala, urgence critique.
4. Crée un dossier de succession et partage judiciaire pour le client Paul Ngassa, avocat
   Maître Biya, tribunal de première instance de Bafoussam, budget estimé 400 000 FCFA.
5. Ouvre un dossier de contentieux administratif et fiscal pour Établissements Fotso &
   Fils, objet : redressement fiscal contesté auprès de la Direction Générale des Impôts,
   avocat Maître Ngono, confidentialité activée.
6. Crée un dossier "Appel (toutes matières)" pour le client Jean Dupont, faisant suite au
   jugement rendu par le tribunal de première instance de Douala, avocat Maître Fotso,
   tribunal la Cour d'appel du Littoral.
7. Ouvre un dossier d'exécution forcée pour le client SA Total Cameroun contre la SARL
   Konan, avocat Maître Biya, objet : saisie-attribution sur compte bancaire suite à
   jugement définitif.
8. Crée un dossier de contentieux OHADA pour Établissements Fotso & Fils, procédure
   "Procédure Commerciale & OHADA", sous-type "Redressement judiciaire & Liquidation des
   entreprises", avocat Maître Ngono, tribunal de commerce de Douala, danger critique.
9. Ouvre un dossier avec demande initiale : "Le client sollicite le recouvrement de sa
   créance de 1 200 000 FCFA et des dommages-intérêts pour préjudice commercial", client
   Paul Ngassa, avocat Maître Fotso.

---

## 3. Facture (`Facture`)

1. Facture le dossier DOS-2026-0012 : honoraires de 500 000 FCFA HT, TVA 19,25 %,
   échéance dans 30 jours.
2. Crée une facture de frais de procédure pour le dossier DOS-2026-0045, montant HT
   150 000 FCFA, description "Frais d'huissier et enregistrement".
3. Facture des diligences sur le dossier DOS-2026-0031 : montant HT 320 000 FCFA, taux de
   TVA 19,25 %, description "Diligence de vérification des créances", statut envoyée.
4. Crée une facture d'acompte sur honoraires pour le dossier DOS-2026-0012, montant HT
   200 000 FCFA, date d'échéance le 15 août 2026.
5. Facture le client SA Total Cameroun sur le dossier DOS-2026-0058, type "autres",
   montant HT 75 000 FCFA, notes internes "Frais de copie et de courrier recommandé".
6. Crée une facture de solde pour le dossier DOS-2026-0012, montant HT 300 000 FCFA, TVA
   19,25 %, statut déjà payée.
7. Facture le dossier DOS-2026-0067 : honoraires de plaidoirie, montant HT 450 000 FCFA,
   description "Honoraires de plaidoirie — audience du 10 juin 2026".

---

## 4. Audience (`Audience`)

1. Programme une audience de plaidoirie pour le dossier DOS-2026-0012 le 15 juillet 2026
   à 9h00, salle 3, tribunal de première instance de Douala, juge Madame la Présidente
   Ateba.
2. Ajoute une audience de délibération pour le dossier DOS-2026-0045 le 20 août 2026 à
   10h30.
3. Crée une audience de conciliation pour le dossier DOS-2026-0031 le 5 juillet 2026 à
   8h30, salle 1, durée prévue 60 minutes.
4. Programme une audience de jugement pour le dossier DOS-2026-0012 le 30 septembre 2026
   à 9h00, juge Monsieur le Président Nkeng.
5. Ajoute une audience en référé pour le dossier DOS-2026-0058, prévue demain à 14h00,
   tribunal de commerce de Douala, salle 2.
6. Crée une audience d'instruction pour le dossier DOS-2026-0067 le 12 juillet 2026 à
   9h30, notes "Prévoir la présence de l'expert-comptable".
7. Enregistre que l'audience du dossier DOS-2026-0012 tenue le 15 juillet 2026 a été
   reportée au 10 août 2026 à 9h00 pour cause d'absence de la partie adverse.
8. Enregistre l'issue de l'audience du dossier DOS-2026-0045 : audience tenue, décision
   favorable au client, décision rendue "Le tribunal fait droit à la demande du
   requérant et condamne le défendeur au paiement de la somme réclamée".

---

## 5. Diligence (`Diligence`)

1. Crée une diligence de type conformité pour le dossier DOS-2026-0012, titre "Audit
   conformité fiscale — société Konan", priorité haute, date de début aujourd'hui,
   échéance le 30 juillet 2026, budget 20 heures.
2. Ouvre une diligence contentieuse pour le dossier DOS-2026-0045, périmètre
   "Vérification des créances impayées avant assignation", priorité critique.
3. Crée une diligence d'acquisition pour le dossier DOS-2026-0058, titre "Due diligence
   fiscale — rachat société cible", priorité haute, échéance dans 45 jours, budget 40
   heures.
4. Ajoute une diligence d'investissement pour le dossier DOS-2026-0031, titre
   "Vérification des garanties bancaires", statut en cours, avocat responsable Maître
   Biya.
5. Crée une diligence de type contrat pour le dossier DOS-2026-0067, titre "Revue des
   clauses du contrat de prestation", description "Vérifier la validité de la clause
   pénale et du délai de résiliation", date limite le 20 juillet 2026.
6. Ouvre une diligence de conformité réglementaire pour le dossier DOS-2026-0012,
   référence client "REF-FOTSO-2026-01", budget 15 heures, confidentiel.
7. Marque la diligence "Audit conformité fiscale — société Konan" du dossier DOS-2026-0012
   comme terminée, recommandations "Mettre à jour les déclarations fiscales 2023-2025 et
   régulariser les pénalités".

---

## 6. Paiement (`Paiement`)

1. Enregistre un paiement de 500 000 FCFA sur la facture liée au dossier DOS-2026-0012,
   mode de paiement virement, date de paiement aujourd'hui, référence "VIR-2026-0456".
2. Ajoute un paiement en espèces de 150 000 FCFA sur la facture du dossier
   DOS-2026-0045, titulaire Jean Dupont.
3. Enregistre un paiement par chèque de 320 000 FCFA sur la facture du dossier
   DOS-2026-0031, numéro de chèque 0012456, banque Afriland First Bank.
4. Ajoute un paiement mobile de 75 000 FCFA sur la facture du dossier DOS-2026-0058,
   référence "MOMO-88932112".
5. Enregistre un paiement partiel de 200 000 FCFA par virement sur la facture du dossier
   DOS-2026-0012, date de valeur demain, notes "Premier versement, solde à régler sous
   30 jours".

---

## 7. Document client (`DocumentCustomer`)

1. Ajoute un document au dossier DOS-2026-0012 : nom "CNI_JeanDupont.pdf", description
   "Copie de la carte nationale d'identité du client", catégorie pièce d'identité.
2. Enregistre un document sur le dossier DOS-2026-0045 : "Jugement_TPI_Yaounde_2026.pdf",
   description "Jugement rendu en première instance", catégorie décision, requis pour
   audience.
3. Ajoute un document confidentiel au dossier DOS-2026-0058 : "Contrat_Cession_Parts.pdf",
   description "Contrat de cession de parts sociales signé le 10 juin 2026".
4. Enregistre le document "Conclusions_Demandeur.pdf" sur le dossier DOS-2026-0031,
   catégorie procédurale, statut validé.

---

## 8. Étape de dossier (`Step`)

1. Crée une étape "Ouverture du dossier" pour le dossier DOS-2026-0012, type ouverture,
   statut en cours, date prévue aujourd'hui.
2. Ajoute une étape "Phase amiable" au dossier DOS-2026-0045, type amiable, description
   "Tentative de résolution amiable avant saisine du tribunal", date prévue dans 15
   jours.
3. Crée une étape "Phase contentieuse" pour le dossier DOS-2026-0058, type contentieux,
   assignée à Maître Ngono.
4. Ajoute une étape "Clôture" au dossier DOS-2026-0012, type clôture, statut terminé,
   date de complétion aujourd'hui.

---

## 9. Exemples jumelés (plusieurs ressources en un seul message)

### Dossier + Facture
> Crée un dossier pour le client Jean Dupont, avocat Maître Ngono, procédure
> "Contentieux civil - Procédure ordinaire", objet : litige commercial avec la SARL
> Konan pour 3 500 000 FCFA, tribunal de Douala. Facture directement des honoraires de
> provision de 500 000 FCFA HT sur ce dossier, TVA 19,25 %.

### Dossier + Audience
> Ouvre un dossier de divorce contentieux pour Awa Mballa, avocat Maître Fotso, tribunal
> de Yaoundé, partie adverse Paul Mballa. Programme aussi la première audience de
> plaidoirie le 10 août 2026 à 9h00, salle 2.

### Dossier + Diligence
> Crée un dossier d'acquisition pour le client SARL Konan Frères, avocat Maître Ngono,
> procédure "Procédure Commerciale & OHADA". Lance en parallèle une diligence
> d'acquisition, titre "Due diligence fiscale — rachat société cible", priorité haute,
> échéance dans 45 jours, budget 40 heures.

### Dossier + Client (client inexistant, créé à la volée)
> Crée un nouveau client : Établissements Nkeng & Fils, société de BTP basée à Douala,
> téléphone 691223344. Ouvre ensuite un dossier pour ce client, objet : litige avec un
> sous-traitant pour malfaçons, avocat Maître Biya, tribunal de commerce de Douala.

### Facture + Paiement
> Crée une facture d'honoraires de 500 000 FCFA HT sur le dossier DOS-2026-0012, TVA
> 19,25 %, échéance dans 30 jours. Enregistre immédiatement un paiement de 250 000 FCFA
> par virement sur cette facture, date de paiement aujourd'hui.

### Audience + Document
> Programme une audience de plaidoirie pour le dossier DOS-2026-0031 le 20 juillet 2026 à
> 9h00, tribunal de première instance de Bafoussam. Ajoute le document
> "Conclusions_Demandeur.pdf" comme pièce requise pour cette audience.

### Combo complet : Dossier + Facture + Audience + Diligence
> Ouvre un nouveau dossier contentieux pour le client Jean Dupont, avocat responsable
> Maître Ngono, procédure "Contentieux civil - Procédure ordinaire", objet : litige
> commercial avec la SARL Konan pour non-paiement de factures de 3 500 000 FCFA, tribunal
> de première instance de Douala, urgence élevée.
> Facture une provision d'honoraires de 500 000 FCFA HT sur ce dossier (TVA 19,25 %).
> Programme la première audience de plaidoirie le 15 juillet 2026 à 9h00, salle 3.
> Lance une diligence contentieuse pour vérifier les créances de la partie adverse avant
> l'audience, priorité haute, échéance le 10 juillet 2026.

### Combo OHADA : Dossier + Diligence + Facture + Paiement
> Crée un dossier de redressement judiciaire OHADA pour le client Établissements Fotso &
> Fils, procédure "Procédure Commerciale & OHADA", sous-type "Redressement judiciaire &
> Liquidation des entreprises", avocat Maître Ngono, tribunal de commerce de Douala.
> Lance une diligence de conformité, titre "Audit préalable au redressement", priorité
> critique, échéance dans 20 jours.
> Facture un acompte sur honoraires de 400 000 FCFA HT sur ce dossier.
> Enregistre un paiement en espèces de 400 000 FCFA sur cette facture, effectué
> aujourd'hui.

### Suivi complet en fin de procédure : Audience + Décision + Facture de solde
> Enregistre l'issue de l'audience de jugement du dossier DOS-2026-0012 : audience tenue,
> décision favorable, décision "Le tribunal condamne la SARL Konan au paiement de
> 3 500 000 FCFA de dommages-intérêts". Facture le solde des honoraires de 300 000 FCFA
> HT sur ce dossier, échéance à 15 jours.

---

## 10. Aide-mémoire des codes BD (énumérations)

### Dossier — `status`
0 Ouvert · 1 Analyse préliminaire · 2 Amiable · 3 Contentieux · 4 Jugement · 5 Appel ·
6 Cassation · 7 Exécution · 8 Clôturé · 9 Archivé · 10 Abandonné

### Dossier — `danger_level` / `priority_level`
Danger : 0 Faible · 1 Normal · 2 Élevé · 3 Critique
Priorité : 0 Normale · 1 Haute · 2 Prioritaire · 3 Urgent absolu

### Dossier — `client_decision` / `recommendation`
Décision client : `transaction` · `contentieux` · `abandon`
Recommandation cabinet : `transaction` · `present_options` · `procedure`

### Dossier — `outcome`
`won` Gagné · `lost` Perdu · `unknown` Inconnu · `settled` Transaction ·
`abandoned` Abandonné

### Facture — `type`
0 Honoraires · 1 Frais de procédure · 2 Diligences · 3 Autres

### Facture — `status`
0 Brouillon · 1 Envoyée · 2 Partiellement payée · 3 Payée · 4 Impayée · 5 Annulée

### Audience — `type`
0 Plaidoirie (HEARING) · 1 Délibération · 2 Jugement · 3 Conciliation

### Audience — `status`
0 Programmée · 1 Tenue · 2 Reportée · 3 Annulée

### Diligence — `type`
`acquisition` · `investment` · `ipo` · `compliance` (conformité) ·
`litigation` (contentieux) · `contract` (contrat)

### Diligence — `status`
`draft` Brouillon · `in_progress` En cours · `review` En relecture ·
`completed` Terminé · `cancelled` Annulé

### Diligence — `priority`
`low` Faible · `medium` Moyenne · `high` Haute · `critical` Critique

### Paiement — `modePaiement`
0 Virement · 1 Chèque · 2 Espèces · 3 Carte · 4 Prélèvement · 5 Mobile Money · 6 Autre

### Paiement — `status`
0 En attente · 1 Validé · 2 Rejeté · 3 Annulé

### Document client — `status`
0 En attente · 1 Validé · 2 Refusé · 3 Expiré · 4 Archivé

### Types de procédure disponibles (seed)
Procédure Civile Ordinaire · Procédure Spéciale (OHADA) · Procédure d'Urgence ·
Voies de Recours · Exécution des Décisions · Procédure Administrative ·
Procédure Pénale · Procédure Commerciale & OHADA · Procédure Traditionnelle

### Sous-types de procédure disponibles (extrait, seed)
Contentieux civil - Procédure ordinaire · Divorce contentieux ·
Divorce sur requête conjointe (amiable) · Succession & Partage judiciaire ·
Litige immobilier & Foncier · Responsabilité civile & Dommages-intérêts ·
Injonction de payer & Injonction de faire · Saisies conservatoires ·
Saisie-attribution / Saisie-vente / Exécution forcée · Référé (toutes formes) ·
Appel (toutes matières) · Pourvoi en cassation & Recours extraordinaires ·
Contentieux administratif & Fiscal · Redressement judiciaire & Liquidation des
entreprises · Justice coutumière & Litiges traditionnels

### Types d'audience disponibles (seed)
Audience Préliminaire · Audience de Mise en État · Audience de Plaidoirie ·
Audience d'Instruction · Audience de Conciliation · Audience de Jugement ·
Audience d'Appel · Audience d'Expertise · Audience de Cassation · Audience en Référé

### Types d'honoraires disponibles (seed)
Honoraires de Consultation · Honoraires de Procédure · Honoraires de Plaidoirie ·
Frais de Dossier · Frais de Déplacement · Frais de Courrier · Frais d'Expertise ·
Acompte sur Honoraires · Règlement du Solde · Frais de Timbre
