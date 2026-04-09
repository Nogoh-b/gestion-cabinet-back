// src/modules/agencies/branch/dto/single-branch-stats.dto.ts
export class SingleBranchStatsDto {
  // Informations générales de l'agence
  agence: {
    id: number;
    nom: string;
    code: string;
    ville: string;
    adresse?: string;
    telephone?: string;
    email?: string;
    statut: number;
    dateCreation: Date;
  };

  // Résumé
  resume: {
    totalEmployes: number;
    totalAvocats: number;
    totalSecretaires: number;
    totalAutresEmployes: number;
    totalClients: number;
    totalDossiers: number;
    totalDossiersActifs: number;
    totalDossiersClos: number;
    totalAudiences: number;
    totalFactures: number;
    chiffreAffaires: number;
  };

  // Statistiques des employés
  employes: {
    parPosition: Array<{ position: string; count: number; percentage: number; color?: string }>;
    recents: Array<{
      id: number;
      nom: string;
      position: string;
      dateEmbauche: Date;
      dossiersActifs: number;
    }>;
    topPerformers: Array<{
      id: number;
      nom: string;
      position: string;
      dossiers: number;
      audiences: number;
      tauxSucces: number;
    }>;
  };

  // Statistiques des clients
  clients: {
    total: number;
    parType: Array<{ type: string; count: number; percentage: number }>;
    recents: Array<{
      id: number;
      nom: string;
      email: string;
      dateCreation: Date;
      dossierCount: number;
    }>;
    topClients: Array<{
      id: number;
      nom: string;
      dossierCount: number;
      montantTotal: number;
    }>;
  };

  // Statistiques des dossiers
  dossiers: {
    total: number;
    parStatut: Array<{ name: string; value: number; percentage: number; color?: string }>;
    parType: Array<{ type: string; count: number; percentage: number }>;
    evolution: Array<{ mois: string; count: number }>;
    recents: Array<{
      id: number;
      numero: string;
      objet: string;
      client: string;
      avocat: string;
      statut: number;
      dateOuverture: Date;
    }>;
  };

  // Statistiques des audiences
  audiences: {
    total: number;
    passees: number;
    aVenir: number;
    annulees: number;
    prochaine?: {
      id: number;
      titre: string;
      date: Date;
      dossier: string;
      client: string;
    };
  };

  // Statistiques financières
  financier: {
    chiffreAffaires: number;
    montantPaye: number;
    montantImpaye: number;
    tauxRecouvrement: number;
    facturesEmises: number;
    facturesPayees: number;
    facturesImpayees: number;
    evolutionCA: Array<{ mois: string; montant: number }>;
  };

  // Performance globale
  performance: {
    tauxOccupationEmployes: number;
    moyenneDossiersParAvocat: number;
    tauxResolutionDossiers: number;
    tauxAudiencesTenues: number;
  };
}