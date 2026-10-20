// interface/write-intent.interface.ts

import { WritePlan } from '../dto/analysis-response.dto';

export type OperationType = 'INSERT' | 'UPDATE' | 'DELETE' | 'ACTION' | 'READ';

/** Enregistrement créé par une opération précédente du même plan. */
export interface PlanCreatedRecord {
  entity: string;
  id: string | number;
  data: any;
  tempId?: string;
}

export interface WriteIntent {
  operation: OperationType;
  entity: string; // 'dossier', 'customer', 'employee'...
  tempId?: any; // 'dossier', 'customer', 'employee'...
  entityId?: string | number; // Pour UPDATE/DELETE
  fields: Record<string, any>; // Les champs à modifier
  confidence: number; // 0-1, score de confiance du LLM
  humanReadable: string; // Description lisible pour confirmation
  /**
   * Configuration de résolution des dépendances (FK).
   * Permet de contrôler le comportement en cas d'ambiguïté.
   * Si non fourni, le mode STRICT est utilisé (comportement actuel).
   */
  resolveConfig?: {
    mode?: 'strict' | 'best_effort';
    minScore?: number;
    ambiguityGap?: number;
  };
  /**
   * QueryRunner optionnel pour participer à une transaction.
   * Si fourni, le handler utilisera queryRunner.manager.save() au lieu de repo.save()
   * pour que les opérations du handler soient atomiques avec le reste du plan.
   */
  queryRunner?: import('typeorm').QueryRunner;
  /**
   * Enregistrements créés plus tôt dans le même plan, dans l'ordre
   * d'exécution : permet à un handler de relier ce qu'il crée aux ressources
   * créées juste avant (ex: action → audience du même plan).
   */
  planCreated?: PlanCreatedRecord[];
}

export interface IntentDetectionResult {
  /** READ = interrogation BD, WRITE = écriture BD, CONVERSATIONAL = réponse directe sans SQL */
  type:
    | 'READ'
    | 'WRITE'
    | 'HELP'
    | 'ADVICE'
    | 'CONVERSATIONAL'
    | 'DOCUMENT'
    | 'TEXT'
    /** Le classifieur hésite : le chat demande le mode à l'utilisateur. */
    | 'UNCERTAIN'
    /** Une compétence du chat (`skill`) répond à la demande. */
    | 'SKILL'
    /** Plusieurs demandes enchaînées (`parts`), traitées dans l'ordre. */
    | 'COMPOSITE';
  /** Compétence reconnue (type SKILL). */
  skill?: string;
  /** Demandes enchaînées (type COMPOSITE), dans l'ordre de la question. */
  parts?: Array<{ kind: 'READ' | 'WRITE' | 'HELP' | 'ADVICE' | 'CHAT' | 'SKILL'; skill?: string }>;
  /** Classes entre lesquelles le classifieur hésite (type UNCERTAIN), la plus probable d'abord. */
  candidates?: Array<'READ' | 'WRITE' | 'HELP' | 'ADVICE' | 'CHAT'>;
  /** Pourquoi ce type, quand une règle locale l'a décidé (affiché dans le chat). */
  reason?: string;
  writeIntent?: WriteIntent;
  writePlan?: WritePlan;
  sqlQuery?: string; // Si READ
  requiresConfirmation: boolean;
  /** Réponse directe de l'IA (mode CONVERSATIONAL uniquement) */
  conversationalResponse?: string;
  /**
   * Présent uniquement quand type === 'WRITE' sans writePlan : la génération
   * du plan d'écriture a échoué malgré le mode WRITE forcé par l'utilisateur.
   * L'appelant doit afficher ce message tel quel plutôt que de retomber sur
   * le chemin READ (qui produirait des refus SQL incohérents).
   */
  writePlanError?: string;
}
