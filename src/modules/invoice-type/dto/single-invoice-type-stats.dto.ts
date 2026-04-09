// src/modules/invoice-type/dto/single-invoice-type-stats.dto.ts
export class SingleInvoiceTypeStatsDto {
  // Informations générales du type de facture
  typeFacture: {
    id: number;
    code: string;
    nom: string;
    description?: string;
    categorie: string;
    tauxTvaDefault: number;
    estFacturable: boolean;
    necessiteApprobation: boolean;
    delaiPaiementDefault: number;
    estActif: boolean;
    codeComptable?: string;
    uniteDefaut?: string;
    prixDefaut?: number;
    exemptTVA?: boolean;
    baseLegale?: string;
    dateCreation: Date;
    dateMiseAJour: Date;
  };

  // Statistiques des factures de ce type
  factures: {
    total: number;
    montantTotal: number;
    montantPaye: number;
    montantImpaye: number;
    parStatut: Array<{ name: string; value: number; montant: number; percentage: number; color?: string }>;
    recents: Array<{
      id: string;
      numero: string;
      client: string;
      dossier: string;
      date: Date;
      montant: number;
      statut: number;
    }>;
    evolutionMensuelle: Array<{ mois: string; count: number; montant: number }>;
  };

  // Clients utilisant ce type
  clients: Array<{
    id: number;
    nom: string;
    factureCount: number;
    montantTotal: number;
    derniereFacture?: Date;
  }>;

  // Dossiers utilisant ce type
  dossiers: Array<{
    id: number;
    numero: string;
    client: string;
    factureCount: number;
    montantTotal: number;
  }>;

  // Périodicité d'utilisation
  periodicite: {
    parMois: Array<{ mois: string; count: number }>;
    parTrimestre: Array<{ trimestre: string; count: number; montant: number }>;
    parAn: Array<{ annee: string; count: number; montant: number }>;
  };

  // Métriques de performance
  performance: {
    montantMoyenParFacture: number;
    delaiMoyenPaiement: number;
    tauxRecouvrement: number;
    facturesImpayees: number;
    montantImpaye: number;
    topMois: { mois: string; montant: number };
  };

  // Tendances
  tendances: {
    evolutionAnnuelle: Array<{ annee: string; montant: number; croissance: number }>;
    saisonnalite: Array<{ mois: number; moyenne: number }>;
  };
}