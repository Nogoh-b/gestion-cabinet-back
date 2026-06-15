export enum TypeCompte {
  ACTIF   = 'ACTIF',
  PASSIF  = 'PASSIF',
  CHARGE  = 'CHARGE',
  PRODUIT = 'PRODUIT',
}

export enum ClasseCompte {
  CLASSE_1 = 1,
  CLASSE_2 = 2,
  CLASSE_3 = 3,
  CLASSE_4 = 4,
  CLASSE_5 = 5,
  CLASSE_6 = 6,
  CLASSE_7 = 7,
  CLASSE_8 = 8,
}

export enum TypeJournal {
  VENTES = 'VENTES',
  ACHATS = 'ACHATS',
  CAISSE = 'CAISSE',
  BANQUE = 'BANQUE',
  OD     = 'OD',
}

export enum StatutExercice {
  OUVERT  = 'OUVERT',
  CLOTURE = 'CLOTURE',
}

export enum SourceModule {
  FACTURE             = 'facture',
  PAIEMENT            = 'paiement',
  SUPPLIER_INVOICE    = 'supplier_invoice',
  EXPENSE_REPORT      = 'expense_report',
  PAYSLIP             = 'payslip',
  REFERRAL_COMMISSION = 'referral_commission',
  MANUEL              = 'manuel',
}
