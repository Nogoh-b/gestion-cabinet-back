// src/modules/diligences/dto/single-diligence-stats.dto.ts
export class SingleDiligenceStatsDto {
  // Informations générales de la diligence
  diligence: {
    id: number;
    titre: string;
    description?: string;
    type: string;
    statut: string;
    priorite: string;
    dateDebut: Date;
    deadline: Date;
    dateCompletion?: Date;
    joursRestants?: number;
    estEnRetard: boolean;
    progression: number;
  };

  // Informations du dossier associé
  dossier: {
    id: number;
    numero: string;
    objet: string;
    client: string;
    avocat: string;
    statut: number;
  };

  // Avocat assigné
  avocat: {
    id: number;
    nom: string;
    email: string;
    specialisation?: string;
  };

  // Statistiques des findings
  findings: {
    total: number;
    resolus: number;
    enAttente: number;
    abandonnes: number;
    parSeverite: Array<{
      severite: string;
      count: number;
      percentage: number;
      color: string;
    }>;
    recents: Array<{
      id: number;
      titre: string;
      severite: string;
      statut: string;
      dateCreation: Date;
    }>;
  };

  // Documents associés
  documents: {
    total: number;
    recents: Array<{
      id: number;
      nom: string;
      type: string;
      date: Date;
      taille: string;
    }>;
  };

  // Métriques de temps
  temps: {
    heuresBudgetees: number;
    heuresPassees: number;
    variance: number;
    pourcentageConsomme: number;
  };
}