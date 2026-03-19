// src/modules/dossiers/dto/single-dossier-stats.dto.ts
export class SingleDossierStatsDto {
  // Informations générales du dossier
  dossier: {
    id: number;
    numero: string;
    objet: string;
    client: string;
    avocat: string;
    statut: number;
    niveauDanger: number;
    dateOuverture: Date;
    dateCloture?: Date;
  };

  // Statistiques des documents
  documents: {
    total: number;
    totalSize: number;
    totalSizeFormatted: string;
    byStatus: Array<{ name: string; value: number; percentage: number; color?: string }>;
    byType: Array<{ name: string; value: number; percentage: number }>;
    recent: Array<{
      id: number;
      nom: string;
      type: string;
      date: Date;
      taille: string;
      statut: number;
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
      jurisdiction: string;
      statut: number;
    };
    parJuridiction: Array<{ name: string; value: number; percentage: number }>;
  };

  // Statistiques des diligences
  diligences: {
    total: number;
    enCours: number;
    terminees: number;
    enRetard: number;
    progressionMoyenne: number;
    echeances: Array<{
      id: number;
      titre: string;
      deadline: Date;
      joursRestants: number;
      priorite: string;
      progression: number;
    }>;
  };

  // Statistiques des factures
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
}