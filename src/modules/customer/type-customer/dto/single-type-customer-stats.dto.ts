// src/modules/customer/type-customer/dto/single-type-customer-stats.dto.ts
export class SingleTypeCustomerStatsDto {
  // Informations générales du type
  type: {
    id: number;
    nom: string;
    code: string;
    description?: string;
    statut: number;
    dateCreation: Date;
    dateMiseAJour: Date;
  };

  // Statistiques des clients
  clients: {
    total: number;
    actifs: number;
    inactifs: number;
    bloques: number;
    avecDossiers: number;
    sansDossiers: number;
    recents: Array<{
      id: number;
      nom: string;
      email: string;
      telephone: string;
      dateCreation: Date;
      dossierCount: number;
    }>;
  };

  // Statistiques des documents requis
  documentsRequis: {
    total: number;
    liste: Array<{
      id: number;
      nom: string;
      code: string;
      description?: string;
      obligatoire: boolean;
    }>;
    parStatut: Array<{
      statut: string;
      count: number;
      percentage: number;
    }>;
  };

  // Statistiques des dossiers
  dossiers: {
    total: number;
    parStatut: Array<{ name: string; value: number; percentage: number; color?: string }>;
    recents: Array<{
      id: number;
      numero: string;
      client: string;
      statut: number;
      dateOuverture: Date;
    }>;
  };

  // Répartition géographique
  repartitionGeographique: Array<{
    ville: string;
    count: number;
    percentage: number;
  }>;

  // Tendances
  evolution: Array<{
    mois: string;
    nouveauxClients: number;
  }>;
}