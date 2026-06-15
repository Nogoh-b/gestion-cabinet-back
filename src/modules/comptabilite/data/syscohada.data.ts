import { ClasseCompte, TypeCompte, TypeJournal } from '../enums/comptabilite.enums';

export const COMPTES_SYSCOHADA: Array<{ numero: string; libelle: string; typeCompte: TypeCompte; classe: ClasseCompte }> = [
  // Classe 1 — Capitaux
  { numero: '101', libelle: 'Capital social',                   typeCompte: TypeCompte.PASSIF, classe: ClasseCompte.CLASSE_1 },
  { numero: '106', libelle: 'Réserves',                         typeCompte: TypeCompte.PASSIF, classe: ClasseCompte.CLASSE_1 },
  { numero: '120', libelle: "Résultat de l'exercice (bénéfice)",typeCompte: TypeCompte.PASSIF, classe: ClasseCompte.CLASSE_1 },
  { numero: '129', libelle: "Résultat de l'exercice (perte)",   typeCompte: TypeCompte.ACTIF,  classe: ClasseCompte.CLASSE_1 },

  // Classe 2 — Immobilisations
  { numero: '215', libelle: 'Installations, agencements',          typeCompte: TypeCompte.ACTIF, classe: ClasseCompte.CLASSE_2 },
  { numero: '218', libelle: 'Matériel de bureau et informatique',  typeCompte: TypeCompte.ACTIF, classe: ClasseCompte.CLASSE_2 },

  // Classe 4 — Tiers
  { numero: '401',     libelle: 'Fournisseurs',                 typeCompte: TypeCompte.PASSIF, classe: ClasseCompte.CLASSE_4 },
  { numero: '411',     libelle: 'Clients',                      typeCompte: TypeCompte.ACTIF,  classe: ClasseCompte.CLASSE_4 },
  { numero: '421',     libelle: 'Personnel — net à payer',      typeCompte: TypeCompte.PASSIF, classe: ClasseCompte.CLASSE_4 },
  { numero: '425',     libelle: 'Personnel — avances et acomptes', typeCompte: TypeCompte.ACTIF, classe: ClasseCompte.CLASSE_4 },
  { numero: '431',     libelle: 'Cotisations sociales à payer',  typeCompte: TypeCompte.PASSIF, classe: ClasseCompte.CLASSE_4 },
  { numero: '445',     libelle: 'TVA collectée',                typeCompte: TypeCompte.PASSIF, classe: ClasseCompte.CLASSE_4 },
  { numero: '445_ded', libelle: 'TVA déductible',               typeCompte: TypeCompte.ACTIF,  classe: ClasseCompte.CLASSE_4 },
  { numero: '467',     libelle: 'Provisions clients (séquestre)',typeCompte: TypeCompte.PASSIF, classe: ClasseCompte.CLASSE_4 },

  // Classe 5 — Trésorerie
  { numero: '512', libelle: 'Banque',             typeCompte: TypeCompte.ACTIF, classe: ClasseCompte.CLASSE_5 },
  { numero: '571', libelle: 'Caisse',             typeCompte: TypeCompte.ACTIF, classe: ClasseCompte.CLASSE_5 },
  { numero: '585', libelle: 'Virements internes', typeCompte: TypeCompte.ACTIF, classe: ClasseCompte.CLASSE_5 },

  // Classe 6 — Charges
  { numero: '601', libelle: 'Fournitures de bureau',           typeCompte: TypeCompte.CHARGE, classe: ClasseCompte.CLASSE_6 },
  { numero: '605', libelle: 'Énergie (électricité, eau)',      typeCompte: TypeCompte.CHARGE, classe: ClasseCompte.CLASSE_6 },
  { numero: '615', libelle: 'Entretien et réparations',        typeCompte: TypeCompte.CHARGE, classe: ClasseCompte.CLASSE_6 },
  { numero: '616', libelle: "Primes d'assurance",              typeCompte: TypeCompte.CHARGE, classe: ClasseCompte.CLASSE_6 },
  { numero: '622', libelle: 'Loyers et charges locatives',     typeCompte: TypeCompte.CHARGE, classe: ClasseCompte.CLASSE_6 },
  { numero: '625', libelle: 'Déplacements et réceptions',      typeCompte: TypeCompte.CHARGE, classe: ClasseCompte.CLASSE_6 },
  { numero: '626', libelle: 'Télécommunications et logiciels', typeCompte: TypeCompte.CHARGE, classe: ClasseCompte.CLASSE_6 },
  { numero: '628', libelle: 'Autres services extérieurs',      typeCompte: TypeCompte.CHARGE, classe: ClasseCompte.CLASSE_6 },
  { numero: '632', libelle: "Rémunérations d'intermédiaires (apporteurs)", typeCompte: TypeCompte.CHARGE, classe: ClasseCompte.CLASSE_6 },
  { numero: '641', libelle: 'Rémunérations du personnel',      typeCompte: TypeCompte.CHARGE, classe: ClasseCompte.CLASSE_6 },
  { numero: '645', libelle: 'Charges sociales',                typeCompte: TypeCompte.CHARGE, classe: ClasseCompte.CLASSE_6 },
  { numero: '651', libelle: 'Redevances et droits',            typeCompte: TypeCompte.CHARGE, classe: ClasseCompte.CLASSE_6 },
  { numero: '671', libelle: 'Charges exceptionnelles',         typeCompte: TypeCompte.CHARGE, classe: ClasseCompte.CLASSE_6 },

  // Classe 7 — Produits
  { numero: '706', libelle: 'Honoraires professionnels',     typeCompte: TypeCompte.PRODUIT, classe: ClasseCompte.CLASSE_7 },
  { numero: '707', libelle: 'Frais de procédure refacturés', typeCompte: TypeCompte.PRODUIT, classe: ClasseCompte.CLASSE_7 },
  { numero: '708', libelle: 'Autres produits de services',   typeCompte: TypeCompte.PRODUIT, classe: ClasseCompte.CLASSE_7 },
  { numero: '771', libelle: 'Produits financiers',           typeCompte: TypeCompte.PRODUIT, classe: ClasseCompte.CLASSE_7 },
  { numero: '777', libelle: 'Produits exceptionnels',        typeCompte: TypeCompte.PRODUIT, classe: ClasseCompte.CLASSE_7 },
];

export const JOURNAUX_SYSCOHADA: Array<{ code: string; libelle: string; typeJournal: TypeJournal }> = [
  { code: 'VTE', libelle: 'Journal des ventes',  typeJournal: TypeJournal.VENTES },
  { code: 'ACH', libelle: 'Journal des achats',  typeJournal: TypeJournal.ACHATS },
  { code: 'BNQ', libelle: 'Journal banque',      typeJournal: TypeJournal.BANQUE },
  { code: 'CAI', libelle: 'Journal caisse',      typeJournal: TypeJournal.CAISSE },
  { code: 'OD',  libelle: 'Opérations diverses', typeJournal: TypeJournal.OD     },
];
