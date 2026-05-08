import { WriteResult } from '../write/write-handler.registry';
import { WriteIntent } from './write-intent.interface';

/**
 * Interface que chaque module métier doit implémenter
 * pour permettre à l'IA de créer/modifier ses entités
 */
export interface EntityWriteHandler<T = any> {
  /** Nom de l'entité (ex: 'dossier', 'customer', 'facture') */
  readonly entityName: string;
  
  /** Description des champs modifiables (pour le prompt IA) */
  getWriteableFieldsSchema(): Promise<WriteableFieldSchema[]>;
  
  /** Validation des champs avant création/modification */
  validateFields(fields: Partial<T>, operation: 'INSERT' | 'UPDATE'): Promise<ValidationResult>;
  
  /** Exécution de l'opération */
  execute(intent: WriteIntent, userId: string): Promise<WriteResult>;
  
  /** Résolution des dépendances (ex: trouver l'ID d'un client par son nom) */
  resolveDependencies?(fields: Partial<T>, userId: string): Promise<Partial<T>>;
}

export interface WriteableFieldSchema {
  name: string;           // Nom technique du champ (ex: "client_id")
  label: string;          // Libellé métier (ex: "Client")
  type: 'string' | 'number' | 'date' | 'boolean' | 'enum' | 'reference';
  required?: boolean;
  enumValues?: string[];  // Pour les champs enum
  referenceEntity?: string; // Pour les FK (ex: "customer")
  example?: string;
  description?: string;
}

export interface ValidationResult {
  valid: boolean;
  errors?: string[];
  transformedFields?: Record<string, any>;
}