// src/core/enums/dossier-status.enum.ts
export enum DossierStatus {
  // Phase d'analyse
  PRELIMINARY_ANALYSIS = 'preliminary_analysis', // Analyse préliminaire
  
  // Phases de résolution
  AMICABLE = 'amicable',                         // Phase transactionnelle
  LITIGATION = 'litigation',                     // Phase contentieuse
  
  // Phases judiciaires
  JUDGMENT = 'judgment',                         // Jugement rendu
  APPEAL = 'appeal',                             // En appel
  CASSATION = 'cassation',                       // En cassation
  EXECUTION = 'execution',                       // Exécution de la décision
  
  // Statuts finaux
  CLOSED = 'closed',
  ARCHIVED = 'archived',
  ABANDONED = 'abandoned'                        // Abandon par le client
}