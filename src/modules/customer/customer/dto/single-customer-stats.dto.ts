// src/modules/customer/customer/dto/single-customer-stats.dto.ts
export class SingleCustomerStatsDto {
  // Informations générales du client
  client: {
    id: number;
    nom: string;
    prenom?: string;
    email?: string;
    telephone?: string;
    telephonePro?: string;
    adresse?: string;
    ville?: string;
    codePostal?: string;
    pays: string;
    type: string;
    typeCode: string;
    statut: number;
    dateCreation: Date;
    derniereActivite?: Date;
  };

  // Statistiques des dossiers
  dossiers: {
    total: number;
    actifs: number;
    clos: number;
    parStatut: Array<{ name: string; value: number; percentage: number; color?: string }>;
    recents: Array<{
      id: number;
      numero: string;
      objet: string;
      statut: number;
      dateOuverture: Date;
      avocat: string;
    }>;
  };

  // Statistiques des audiences
  audiences: {
    total: number;
    passees: number;
    aVenir: number;
    prochaine?: {
      id: number;
      titre: string;
      date: Date;
      jurisdiction: string;
    };
  };

  // Statistiques des diligences
  diligences: {
    total: number;
    enCours: number;
    terminees: number;
    enRetard: number;
  };

  // Statistiques des documents
  documents: {
    total: number;
    totalSize: number;
    totalSizeFormatted: string;
    parStatut: Array<{ name: string; value: number; percentage: number }>;
    recents: Array<{
      id: number;
      nom: string;
      type: string;
      date: Date;
      taille: string;
    }>;
  };

  // Statistiques financières
  factures: {
    total: number;
    montantTotal: number;
    montantPaye: number;
    montantImpaye: number;
    tauxRecouvrement: number;
    parStatut: Array<{ name: string; value: number; montant: number; percentage: number }>;
    recentes: Array<{
      id: string;
      numero: string;
      date: Date;
      montant: number;
      statut: number;
      estPayee: boolean;
    }>;
  };

  // Activité récente
  activiteRecente: Array<{
    id: string;
    type: 'dossier' | 'audience' | 'diligence' | 'document' | 'facture';
    description: string;
    date: Date;
    lien?: string;
  }>;
}