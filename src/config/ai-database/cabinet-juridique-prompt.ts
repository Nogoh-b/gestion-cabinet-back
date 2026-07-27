/**
 * Règles métier spécifiques au cabinet juridique.
 * Injectées dans le prompt IA via AiDatabaseProjectConfig.
 *
 * Ce fichier peut être modifié librement sans toucher au module core AiDatabase.
 */

/**
 * Prompt système pour l'analyse métier des résultats SQL.
 * Injecté via AiDatabaseProjectConfig.analysisSystemPrompt.
 */
export const CABINET_JURIDIQUE_ANALYSIS_PROMPT = `Tu es un expert métier spécialisé dans la gestion \
de dossiers juridiques, contentieux civils, procédures administratives et recouvrement.`;

export const CABINET_JURIDIQUE_READ_RULES = `
### Chiffre d'affaires / CA
- Par defaut, "chiffre d'affaires", "chiffre d'affaire", "CA" ou "revenu facture" signifie chiffre d'affaires facture HT du cabinet.
- Requete par defaut: utiliser la table factures avec l'alias f et calculer SUM(f.montant_ht).
- Exclure les factures annulees: f.status <> 5.
- Ne pas ajouter de filtre de date si l'utilisateur ne mentionne aucune periode.
- "mon chiffre d'affaires" designe le cabinet courant/tenant courant, pas le dernier client ou dossier du fil.
- Le filtre tenant est gere par le core: ne hardcode jamais tenant_id.
- Exemple sans periode: SELECT COALESCE(SUM(f.montant_ht), 0) AS chiffre_affaires_ht FROM factures f WHERE f.status <> 5 LIMIT 50.

### Chiffre d'affaires encaisse
- Si la question mentionne "encaisse", "recu", "paye", "regle" ou "paiements recus", calculer les encaissements avec paiements p.
- Utiliser p.status = 1 pour les paiements valides.
- Joindre factures f ON p.facture_id = f.id pour exclure les factures annulees avec f.status <> 5.
- Pour une periode sur l'encaisse, filtrer p.date_paiement. Pour une periode sur le CA facture, filtrer f.date_facture.

### Chiffre d'affaires par client
- Si l'utilisateur demande le chiffre d'affaires d'un client, joindre customer c ON f.client_id = c.id et filtrer le client par ses champs reels.
- Sans client explicitement demande, ne reprends pas automatiquement le client du fil pour une question "mon chiffre d'affaires".

### Identifiants lisibles
- Un numero de facture (ex: FAC2-202606-0001) filtre factures.numero, jamais factures.id.
- Un numero de dossier (ex: DOS1-202606-0001) filtre dossiers.dossier_number, jamais dossiers.id.
- La colonne id (numerique/UUID) ne doit etre comparee qu'a des valeurs purement numeriques ou UUID, jamais a un identifiant contenant des lettres ou des tirets.
`;

export const CABINET_JURIDIQUE_READ_CLARIFICATION_PRESETS = [
  {
    id: 'chiffre_affaires',
    keywords: [
      'chiffre d affaires',
      'chiffre d affaire',
      'ca',
      'revenu facture',
      'revenus factures',
      'revenu',
      'revenus',
      'recette',
      'recettes',
      'honoraire',
      'honoraires',
      'rentabilite',
      'benefice',
      'marge',
      'situation financiere',
    ],
    reason: 'La demande parle de chiffre d\'affaires, mais il faut choisir l\'angle de calcul.',
    question: 'Quel chiffre veux-tu consulter ?',
    options: [
      {
        id: 'factures_payees',
        label: 'Factures payees',
        description: 'Compter uniquement les factures marquees comme payees.',
        followUpQuestion: 'Combien de factures payees composent le chiffre d\'affaires de mon cabinet ?',
        specificTables: ['factures'],
      },
      {
        id: 'paiements_recus',
        label: 'Paiements recus',
        description: 'Additionner les paiements valides reellement encaisses.',
        followUpQuestion: 'Quel montant mon cabinet a-t-il encaisse via les paiements recus valides ?',
        specificTables: ['paiements', 'factures'],
      },
      {
        id: 'ca_facture_ht',
        label: 'CA facture HT',
        description: 'Somme HT des factures emises non annulees, sans tenir compte des encaissements.',
        followUpQuestion: 'Quel est le chiffre d\'affaires facture HT de mon cabinet ?',
        specificTables: ['factures'],
      },
      {
        id: 'ca_apres_salaires',
        label: 'Inclure salaires',
        description: 'Comparer le chiffre d\'affaires avec la masse salariale.',
        followUpQuestion: 'Quel est le chiffre d\'affaires de mon cabinet apres deduction des salaires ?',
        specificTables: ['factures', 'paiements', 'payslip', 'payslip_line'],
      },
    ],
  },
  {
    id: 'factures',
    keywords: [
      'facture impayee', 'factures impayees', 'facture en retard', 'factures en retard',
      'facture en attente', 'factures en attente', 'relance facture', 'impayes',
      'creance', 'creances', 'solde client', 'encours client',
    ],
    reason: 'Les factures peuvent etre consultees selon plusieurs criteres.',
    question: 'Quel aspect des factures souhaitez-vous consulter ?',
    options: [
      { id: 'factures_impayees', label: 'Factures impayees', description: 'Liste des factures non reglees avec leur anciennete.', followUpQuestion: 'Liste les factures dont le statut est impaye avec le client, le montant et la date d\'emission', specificTables: ['factures', 'customer'] },
      { id: 'total_impayes', label: 'Total des impayes', description: 'Montant total des factures en attente de reglement.', followUpQuestion: 'Quel est le montant total des factures impayees ?', specificTables: ['factures'] },
      { id: 'factures_par_client', label: 'Par client', description: 'Repartition des factures par client.', followUpQuestion: 'Quel est le montant total des factures par client ?', specificTables: ['factures', 'customer'] },
    ],
  },
  {
    id: 'paiements',
    keywords: [
      'paiement recu', 'paiements recus', 'reglement', 'reglements',
      'encaissement', 'encaissements', 'tresorerie',
    ],
    reason: 'Les paiements peuvent etre consultes de differentes manieres.',
    question: 'Que souhaitez-vous savoir sur les paiements ?',
    options: [
      { id: 'paiements_recents', label: 'Paiements recents', description: 'Liste des derniers paiements recus.', followUpQuestion: 'Liste les 20 derniers paiements recus avec le client, le montant et la date', specificTables: ['paiements', 'customer'] },
      { id: 'total_paiements', label: 'Total encaisse', description: 'Montant total des paiements recus.', followUpQuestion: 'Quel est le montant total des paiements recus cette annee ?', specificTables: ['paiements'] },
      { id: 'paiements_mois', label: 'Par mois', description: 'Evolution des paiements par mois.', followUpQuestion: 'Donne le total des paiements recus par mois pour l\'annee en cours', specificTables: ['paiements'] },
    ],
  },
  {
    id: 'dossiers',
    keywords: [
      'dossier en cours', 'dossiers en cours', 'dossiers ouverts', 'dossiers actifs',
      'etat des dossiers', 'situation des dossiers', 'bilan des dossiers',
      'dossiers du cabinet', 'mes dossiers', 'nos dossiers', 'tous les dossiers',
      'nombre de dossiers', 'combien de dossiers', 'statistiques dossiers',
    ],
    reason: 'La consultation des dossiers peut prendre plusieurs angles.',
    question: 'Que souhaitez-vous savoir sur les dossiers ?',
    options: [
      { id: 'dossiers_count', label: 'Nombre de dossiers', description: 'Compter les dossiers en cours, clos et total.', followUpQuestion: 'Combien de dossiers sont en cours et combien sont clotures ?', specificTables: ['dossiers'] },
      { id: 'dossiers_list', label: 'Liste des dossiers', description: 'Afficher la liste des dossiers ouverts avec leurs details.', followUpQuestion: 'Liste les dossiers en cours avec leur reference, client et date d\'ouverture', specificTables: ['dossiers', 'customer'] },
      { id: 'dossiers_avocat', label: 'Dossiers par avocat', description: 'Repartition des dossiers par collaborateur.', followUpQuestion: 'Combien de dossiers en cours par avocat ?', specificTables: ['dossiers', 'employee'] },
    ],
  },
  {
    id: 'audiences',
    keywords: [
      'audience a venir', 'audiences a venir', 'prochaine audience', 'prochaines audiences',
      'calendrier audience', 'planning audience', 'audience prevue', 'audiences prevues',
      'audience passee', 'audiences passees', 'audience du jour', 'audiences du jour',
      'audience cette semaine', 'audiences cette semaine', 'audience ce mois',
    ],
    reason: 'Les audiences peuvent etre consultees de differentes manieres.',
    question: 'Que souhaitez-vous consulter sur les audiences ?',
    options: [
      { id: 'audiences_semaine', label: 'Cette semaine', description: 'Audiences programmees pour la semaine en cours.', followUpQuestion: 'Liste les audiences prevues cette semaine avec la date, le dossier et la juridiction', specificTables: ['audiences', 'dossiers'] },
      { id: 'audiences_mois', label: 'Ce mois', description: 'Toutes les audiences du mois en cours.', followUpQuestion: 'Liste les audiences prevues ce mois avec la date, le dossier et la juridiction', specificTables: ['audiences', 'dossiers'] },
      { id: 'audiences_avocat', label: 'Par avocat', description: 'Audiences a venir ventilees par collaborateur.', followUpQuestion: 'Combien d\'audiences a venir par avocat ?', specificTables: ['audiences', 'employee', 'dossiers'] },
    ],
  },
  {
    id: 'clients',
    keywords: [
      'liste des clients', 'tous les clients', 'mes clients', 'nos clients',
      'clients actifs', 'clients du cabinet', 'nombre de clients',
      'combien de clients', 'nouveaux clients', 'client recent',
    ],
    reason: 'Les clients peuvent etre consultes selon differents criteres.',
    question: 'Que souhaitez-vous savoir sur les clients ?',
    options: [
      { id: 'clients_list', label: 'Liste des clients', description: 'Afficher tous les clients avec leurs coordonnees.', followUpQuestion: 'Liste les clients avec leur nom, email et telephone', specificTables: ['customer'] },
      { id: 'clients_count', label: 'Nombre de clients', description: 'Compter le nombre total de clients.', followUpQuestion: 'Combien de clients sont enregistres dans le cabinet ?', specificTables: ['customer'] },
      { id: 'clients_dossiers', label: 'Clients avec dossiers', description: 'Clients ayant des dossiers en cours.', followUpQuestion: 'Liste les clients qui ont au moins un dossier en cours avec le nombre de dossiers', specificTables: ['customer', 'dossiers'] },
    ],
  },
  {
    id: 'avocats',
    keywords: [
      'avocat', 'avocats', 'collaborateur', 'collaborateurs',
      'equipe', 'effectif', 'personnel', 'charge de travail',
      'performance avocat', 'activite avocat', 'productivite',
    ],
    reason: 'L\'activite des collaborateurs peut etre consultee selon plusieurs axes.',
    question: 'Que souhaitez-vous savoir sur les collaborateurs ?',
    options: [
      { id: 'avocats_list', label: 'Liste des avocats', description: 'Afficher les collaborateurs du cabinet.', followUpQuestion: 'Liste les avocats et collaborateurs du cabinet avec leur poste', specificTables: ['employee'] },
      { id: 'charge_travail', label: 'Charge de travail', description: 'Nombre de dossiers en cours par avocat.', followUpQuestion: 'Combien de dossiers en cours sont assignes a chaque avocat ?', specificTables: ['dossiers', 'employee'] },
      { id: 'ca_par_avocat', label: 'CA par avocat', description: 'Chiffre d\'affaires genere par chaque collaborateur.', followUpQuestion: 'Quel est le chiffre d\'affaires facture par avocat ?', specificTables: ['factures', 'employee'] },
    ],
  },
  {
    id: 'documents',
    keywords: [
      'document', 'documents', 'piece jointe', 'pieces jointes',
      'fichier', 'fichiers', 'contrat', 'contrats',
    ],
    reason: 'Les documents peuvent etre consultes de differentes manieres.',
    question: 'Que souhaitez-vous consulter sur les documents ?',
    options: [
      { id: 'documents_recents', label: 'Documents recents', description: 'Derniers documents ajoutes au systeme.', followUpQuestion: 'Liste les 20 derniers documents ajoutes avec leur nom, type et le dossier associe', specificTables: ['document_customer', 'dossiers'] },
      { id: 'documents_par_dossier', label: 'Par dossier', description: 'Nombre de documents par dossier.', followUpQuestion: 'Combien de documents sont associes a chaque dossier ?', specificTables: ['document_customer', 'dossiers'] },
      { id: 'documents_par_type', label: 'Par type', description: 'Repartition des documents par type.', followUpQuestion: 'Combien de documents par type de document ?', specificTables: ['document_customer'] },
    ],
  },
  {
    id: 'diligences',
    keywords: [
      'diligence', 'diligences', 'tache', 'taches',
      'a faire', 'en retard', 'echeance', 'echeances',
    ],
    reason: 'Les diligences peuvent etre consultees selon leur statut ou leur echeance.',
    question: 'Que souhaitez-vous savoir sur les diligences ?',
    options: [
      { id: 'diligences_en_cours', label: 'En cours', description: 'Diligences actuellement en cours.', followUpQuestion: 'Liste les diligences en cours avec leur echeance, le dossier et l\'avocat responsable', specificTables: ['diligences', 'dossiers', 'employee'] },
      { id: 'diligences_retard', label: 'En retard', description: 'Diligences dont l\'echeance est depassee.', followUpQuestion: 'Liste les diligences dont la date d\'echeance est depassee', specificTables: ['diligences', 'dossiers'] },
      { id: 'diligences_avocat', label: 'Par avocat', description: 'Repartition des diligences par collaborateur.', followUpQuestion: 'Combien de diligences en cours par avocat ?', specificTables: ['diligences', 'employee'] },
    ],
  },
  {
    id: 'comptabilite',
    keywords: [
      'comptabilite', 'ecriture comptable', 'ecritures comptables',
      'journal comptable', 'grand livre', 'balance', 'compte comptable',
      'plan comptable', 'exercice comptable',
    ],
    reason: 'La comptabilite peut etre consultee selon differents axes.',
    question: 'Quel aspect de la comptabilite souhaitez-vous consulter ?',
    options: [
      { id: 'ecritures_recentes', label: 'Ecritures recentes', description: 'Dernieres ecritures comptables enregistrees.', followUpQuestion: 'Liste les 20 dernieres ecritures comptables avec le journal, la date, le libelle et le montant', specificTables: ['ecriture', 'journal'] },
      { id: 'solde_comptes', label: 'Solde des comptes', description: 'Solde actuel des principaux comptes comptables.', followUpQuestion: 'Donne le solde (total debit - total credit) de chaque compte comptable', specificTables: ['ecriture', 'compte'] },
      { id: 'ecritures_journal', label: 'Par journal', description: 'Ecritures ventilees par journal comptable.', followUpQuestion: 'Combien d\'ecritures et quel montant total par journal comptable ?', specificTables: ['ecriture', 'journal'] },
    ],
  },
];

export const CABINET_JURIDIQUE_PROMPT_RULES = `
### 10. 👤 Règle ABSOLUE pour les COLLABORATEURS (employee)
Les collaborateurs NE PEUVENT PAS être créés via ce système.
Un collaborateur (employee) est obligatoirement lié à un compte utilisateur (User) existant
avec authentification, mot de passe et rôles — ce qui ne peut pas être géré par l'IA.
Si l'utilisateur demande de "créer un collaborateur", "ajouter un avocat", "enregistrer un employé"
ou toute variante, réponds UNIQUEMENT :
{ "type": "READ" }
Et explique que la création se fait via l'interface RH dédiée.
En revanche, la MODIFICATION de champs métier d'un collaborateur existant est autorisée
(spécialisation, taux horaire, disponibilité, statut, etc.).

### 11. 👤 Règle CRITIQUE pour les NOMS des COLLABORATEURS (employee vs user)
La table "employee" NE contient PAS les colonnes "last_name" ni "first_name".
Ces colonnes se trouvent UNIQUEMENT dans la table "user", liée à "employee" via une clé primaire partagée (employee.id = user.id).
Quand tu génères une requête SQL qui doit récupérer le nom ou le prénom d'un collaborateur, tu DOIS :
- Faire un LEFT JOIN de "employee" vers "user" sur user.id = employee.id
- Utiliser "user.last_name" et "user.first_name" au lieu de "employee.last_name" ou "employee.first_name"
- Exemple correct : SELECT u.last_name, u.first_name FROM employee e LEFT JOIN user u ON u.id = e.id
- Ne JAMAIS écrire : e.last_name, e.first_name, employee.last_name, employee.first_name
⚠️ Pour le nom complet, utilise CONCAT(u.first_name, ' ', u.last_name).

### 9. 📄 Règle pour les DOCUMENTS
Les documents (pièces jointes, fichiers) NE PEUVENT PAS être créés via ce système.
Pour ajouter un document à un dossier, l'utilisateur doit utiliser l'interface d'upload dédiée.
Si l'utilisateur demande d'enregistrer, joindre ou ajouter un fichier/document, réponds :
{ "type": "READ" } et génère un message explicatif (ne tente JAMAIS d'INSERT sur "documents").

### 5. 🏛️ Règle CRITIQUE pour les DOSSIERS
Quand tu crées un dossier, tu DOIS OBLIGATOIREMENT inclure :
- **procedure_type** : le type de procédure (ex: "Contentieux civil", "Droit de la famille", "Droit des affaires", "Droit des étrangers")
- **procedure_subtype** : le sous-type de procédure (ex: "Divorce", "Rupture conventionnelle", "Recouvrement", "Refus de titre de séjour")
- Il faudrait toujours un objet clair du dossier (ex: "Recours contre refus de renouvellement de titre de séjour") mais si tu ne peux pas le déduire, tu peux le laisser vide.
Ces deux champs sont OBLIGATOIRES. Si l'utilisateur mentionne "divorce", "contentieux",
"recouvrement", "civil", etc., déduis le type et sous-type de procédure correspondants.

### 7. 💰 Règle CRITIQUE pour les DONNÉES FINANCIÈRES
Quand des données financières sont présentes dans le texte (honoraires, provisions, factures, paiements),
tu DOIS créer les entités correspondantes APRÈS le dossier.

**Mots déclencheurs à détecter** :
"honoraires", "provision", "forfait", "HT", "TTC", "€", "euros", "réglé", "payé",
"acompte", "solde", "facture", "paiement", "virement", "chèque".

**IMPORTANT - Référencer un dossier dans une facture** :
Utilise TOUJOURS le champ "dossier" (jamais "procedure_instance") avec le numéro de dossier (ex: "DOS-2026-0018-649D").
Le système résoudra automatiquement le numéro en ID.

**Règles de création** :
- **Facture** → INSERT dans l'entite "factures" avec :
  - champ "dossier" : numéro du dossier (ex: "DOS-2026-0018-649D") — JAMAIS "procedure_instance"
  - champ "montantHT" : montant HT en nombre (ex: 1800.00)
  - champ "invoice_type" : nom du type de facture (ex: "Honoraires de Procédure", "Honoraires de Rédaction")
  - champ "description" : objet de la facture (ex: "Forfait recours gracieux + contentieux")
  - champ "status" : 2=PARTIELLEMENT_PAYEE si provision reçue, 1=ENVOYEE sinon, 3=PAYEE si tout réglé
  - Référence le dossier via numéro ou tempId, le client via tempId ou nom

- **Paiement** → INSERT dans l'entite "paiements" APRÈS la facture correspondante avec :
  - champ "montant" : montant payé en nombre (ex: 900.00)
  - champ "datePaiement" : date du paiement si mentionnée (format YYYY-MM-DD), sinon "{{today}}"
  - champ "modePaiement" : 0=VIREMENT (défaut), 1=CHEQUE, 2=ESPECES, 3=CARTE
  - champ "status" : 1=VALIDE si paiement déjà effectué
  - Référence la facture via tempId

**Exemple de plan financier** :
  { "operation": "INSERT", "entity": "factures", "tempId": "facture_1",
    "fields": { "dossier": "DOS-2026-0018-649D", "montantHT": 1800.00,
                "invoice_type": "Honoraires de Procédure",
                "description": "Forfait recours gracieux + contentieux",
                "status": "2" } },
  { "operation": "INSERT", "entity": "paiements", "tempId": "paiement_1",
    "fields": { "montant": 900.00, "datePaiement": "2026-04-15", "modePaiement": "0",
                "status": "1", "facture": "{{facture_1.id}}" } }

### 8. 🗓️ Règle pour les AUDIENCES ET ÉCHÉANCES PROCÉDURALES
Quand des dates de procédure, audiences, délais légaux ou échéances sont mentionnés,
crée des entités "audiences" correspondantes APRÈS le dossier.

**Mots déclencheurs à détecter** :
"audience", "jugement", "délibération", "plaidoirie", "délai", "échéance", "rejet implicite",
"convocation", "comparution", "conciliation", "rendez-vous tribunal".

**Règles de création** :
- INSERT dans l'entité "audiences" avec :
  - champ "audience_date" : date au format YYYY-MM-DD
  - champ "audience_time" : heure si mentionnée, sinon "09:00"
  - champ "type" : 0=Plaidoirie (défaut), 1=Délibération, 2=Jugement, 3=Conciliation
  - champ "status" : 0=Programmée (défaut)
  - champ "notes" : contexte (ex: "Délai de réponse au recours gracieux")
  - Référence le dossier via tempId
  
**Règle CRITIQUE pour le report d'une audience existante** :
Quand l'utilisateur demande de renvoyer, reporter, reprogrammer ou marquer une audience comme passée avec un renvoi :
- génère une opération UPDATE sur "audiences"
- inclus TOUJOURS :
  - "status": "2"
  - "reason": motif du renvoi
  - "report_content": rapport d'audience rédigé
  - "audience_date": nouvelle date du renvoi
  - "audience_time": nouvelle heure du renvoi
  - "outcome": "postponed"
- ne propose PAS un simple UPDATE avec seulement "status" et "outcome"
- si la nouvelle date, l'heure ou le rapport manquent, baisse la confiance et demande confirmation
`;

/**
 * Prompt système pour les réponses conversationnelles (questions hors-BD).
 * Injecté via AiDatabaseProjectConfig.conversationalSystemPrompt.
 */
export const CABINET_JURIDIQUE_CONVERSATIONAL_PROMPT = `Tu es l'assistant IA d'un cabinet d'avocats. \
Tu réponds aux questions générales et aux salutations de façon courtoise et professionnelle. \
Pour les questions métier spécifiques (consulter des dossiers, clients, factures, audiences, paiements), \
tu invites l'utilisateur à reformuler sa demande de façon précise afin de pouvoir interroger la base de données.`;

export const CABINET_JURIDIQUE_PROMPT_EXAMPLE = `{
  "type": "WRITE",
  "writePlan": {
    "transaction": true,
    "operations": [
      {
        "operation": "INSERT",
        "entity": "customer",
        "tempId": "new_client",
        "fields": {
          "first_name": "Amir",
          "last_name": "Ziani",
          "email": "amir.ziani@gmail.com",
          "phone": "0712345678"
        }
      },
      {
        "operation": "INSERT",
        "entity": "dossiers",
        "tempId": "new_dossier",
        "fields": {
          "client": "{{new_client.id}}",
          "object": "Recours contre refus de renouvellement de titre de séjour Salarié",
          "lawyer": "Nom Avocat",
          "procedure_type": "Droit des étrangers",
          "procedure_subtype": "Refus de titre de séjour",
          "opposing_party_name": "Préfecture du Rhône",
          "priority_level": 2
        }
      },
      {
        "operation": "INSERT",
        "entity": "factures",
        "tempId": "facture_honoraires",
        "fields": {
          "dossier": "{{new_dossier.id}}",
          "client": "{{new_client.id}}",
          "montantHT": 1800.00,
          "type": "0",
          "description": "Forfait recours gracieux + contentieux",
          "status": "2"
        }
      },
      {
        "operation": "INSERT",
        "entity": "paiements",
        "tempId": "paiement_provision",
        "fields": {
          "facture": "{{facture_honoraires.id}}",
          "montant": 900.00,
          "datePaiement": "2026-04-15",
          "modePaiement": "0",
          "status": "1"
        }
      },
      {
        "operation": "INSERT",
        "entity": "audiences",
        "tempId": "echeance_rejet",
        "fields": {
          "dossier": "{{new_dossier.id}}",
          "audience_date": "2026-06-22",
          "audience_time": "09:00",
          "type": "0",
          "status": "0",
          "notes": "Délai de réponse au recours gracieux — silence vaut rejet implicite"
        }
      }
    ],
    "humanReadable": "Créer le client, le dossier, la facture d'honoraires (1800€ HT), la provision reçue (900€) et l'échéance du recours gracieux",
    "confidence": 0.92
  }
}`;
