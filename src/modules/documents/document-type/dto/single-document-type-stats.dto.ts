// src/modules/documents/document-type/dto/single-document-type-stats.dto.ts
export class SingleDocumentTypeStatsDto {
  // Informations générales du type de document
  typeDocument: {
    id: number;
    code: string;
    nom: string;
    description?: string;
    dureeValidite?: number;
    mimetype: string;
    tailleMax: string;
    estRequis: boolean;
    statut: number;
    dateCreation: Date;
    dateMiseAJour: Date;
  };

  // Statistiques des documents de ce type
  documents: {
    total: number;
    totalSize: number;
    totalSizeFormatted: string;
    tailleMoyenne: number;
    parStatut: Array<{ name: string; value: number; percentage: number; color?: string }>;
    recents: Array<{
      id: number;
      nom: string;
      dossier: string;
      client: string;
      date: Date;
      taille: string;
      statut: number;
    }>;
  };

  // Types de clients associés
  typesClients: Array<{
    id: number;
    nom: string;
    code: string;
    clientsCount: number;
  }>;

  // Répartition par dossier
  parDossier: Array<{
    dossierId: number;
    dossierNumber: string;
    count: number;
    percentage: number;
  }>;

  // Statistiques par uploader
  parUploader: Array<{
    userId: number;
    userName: string;
    count: number;
    percentage: number;
  }>;

  // Évolution des uploads
  evolution: Array<{
    mois: string;
    count: number;
    totalSize: number;
  }>;

  // Métriques de conformité
  conformite: {
    tauxUtilisation: number;
    dossiersRequis: number;
    dossiersAvecDocument: number;
    tauxCouverture: number;
  };
}