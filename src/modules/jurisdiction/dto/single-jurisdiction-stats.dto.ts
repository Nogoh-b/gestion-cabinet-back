// src/modules/jurisdiction/dto/single-jurisdiction-stats.dto.ts
export class SingleJurisdictionStatsDto {
  // Informations générales de la juridiction
  juridiction: {
    id: number;
    nom: string;
    code: string;
    niveau: string;
    type: string;
    ville: string;
    adresse?: string;
    telephone?: string;
    email?: string;
    siteWeb?: string;
    estActive: boolean;
    dateCreation: Date;
  };

  // Statistiques des audiences
  audiences: {
    total: number;
    passees: number;
    aVenir: number;
    annulees: number;
    tauxTenues: number;
    prochaine?: {
      id: number;
      titre: string;
      date: Date;
      dossierNumber: string;
      client: string;
    };
    parStatut: Array<{ name: string; value: number; percentage: number; color?: string }>;
    parMois: Array<{ mois: string; count: number }>;
  };

  // Statistiques des dossiers
  dossiers: {
    total: number;
    actifs: number;
    clos: number;
    parStatut: Array<{ name: string; value: number; percentage: number; color?: string }>;
    parTypeProcedure: Array<{ name: string; value: number; percentage: number }>;
    recents: Array<{
      id: number;
      numero: string;
      objet: string;
      client: string;
      statut: number;
      dateOuverture: Date;
    }>;
  };

  // Statistiques des avocats
  avocats: {
    total: number;
    avecAudiences: Array<{
      id: number;
      nom: string;
      audiencesCount: number;
      dossiersCount: number;
    }>;
  };

  // Performance
  performance: {
    totalAudiences: number;
    moyenneParMois: number;
    moisPlusActif: string;
    jourPlusActif: string;
    tauxOccupation: number;
  };
}