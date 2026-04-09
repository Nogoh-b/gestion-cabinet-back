// src/modules/agencies/employee/dto/single-employee-stats.dto.ts
export class SingleEmployeeStatsDto {
  // Informations générales de l'employé
  employe: {
    id: number;
    nom: string;
    email: string;
    telephone: string;
    position: string;
    specialisation?: string;
    numeroBarreau?: string;
    villeBarreau?: string;
    anneesExperience: number;
    tauxHoraire: number;
    dateEmbauche: Date;
    dateNaissance?: Date;
    statut: string;
    estDisponible: boolean;
    adresseProfessionnelle?: string;
    numeroSiret?: string;
    numeroTVA?: string;
    bio?: string;
    langues: string[];
    domainesExpertise: string[];
  };

  // Résumé de l'activité
  resume: {
    dossiersActifs: number;
    dossiersClos: number;
    totalDossiers: number;
    audiencesAVenir: number;
    audiencesPassees: number;
    diligencesEnCours: number;
    diligencesTerminees: number;
    tauxOccupation: number;
    managed: {
      actifs: number;
      clos: number;
      total: number;
    };
    collaborating: {
      actifs: number;
      clos: number;
      total: number;
    };
  };

  // Dossiers gérés
  dossiers: {
    actifs: Array<{
      id: number;
      numero: string;
      objet: string;
      client: string;
      statut: number;
      niveauDanger: number;
      dateOuverture: Date;
      prochaineAudience?: Date;
    }>;
    recents: Array<{
      id: number;
      numero: string;
      client: string;
      dateOuverture: Date;
      statut: number;
    }>;
    parStatut: Array<{ name: string; value: number; percentage: number; color?: string }>;
    parType: Array<{ type: string; count: number; percentage: number }>;
  };

  // Audiences
  audiences: {
    aVenir: Array<{
      id: number;
      titre: string;
      date: Date;
      dossier: string;
      client: string;
      juridiction: string;
    }>;
    passees: Array<{
      id: number;
      titre: string;
      date: Date;
      dossier: string;
      client: string;
      statut: string;
    }>;
    total: number;
    tauxTenues: number;
  };

  // Diligences
  diligences: {
    enCours: Array<{
      id: number;
      titre: string;
      dossier: string;
      deadline: Date;
      joursRestants: number;
      priorite: string;
      progression: number;
    }>;
    terminees: Array<{
      id: number;
      titre: string;
      dossier: string;
      dateCompletion: Date;
      statut: string;
    }>;
    total: number;
    tauxCompletion: number;
  };

  // Performance
  performance: {
    dossiersClosParMois: Array<{ mois: string; count: number }>;
    tempsMoyenTraitement: number;
    tauxSucces: number;
    audiencesTenues: number;
    audiencesAnnulees: number;
    diligencesDansLesTemps: number;
  };

  // Charge de travail
  chargeTravail: {
    currentLoad: number;
    maxLoad: number;
    disponibilite: number;
    recommandation: string;
  };

  // Collaboration
  collaboration: {
    dossiersPartages: number;
    colleguesFrequents: Array<{
      id: number;
      nom: string;
      dossiersCommuns: number;
    }>;
  };
}