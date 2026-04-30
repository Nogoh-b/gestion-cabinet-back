import 'reflect-metadata';

export const BUSINESS_METADATA_KEY = 'business:metadata';

export interface BusinessColumnMetadata {
  label: string;           // Libellé métier (ex: "Numéro de dossier")
  description: string;     // Description détaillée
  example?: string;        // Exemple de valeur
  sensitive?: boolean;     // Donnée sensible (à ne pas exposer)
  unit?: string;           // Unité (€, jours, etc.)
  format?: 'date' | 'currency' | 'percentage' | 'phone' | 'email';
  importance?: 'critical' | 'high' | 'medium' | 'low';
  group?: string;          // Groupe de colonnes (ex: "identification")
  ignored?: boolean;  
}

export interface BusinessTableMetadata {
  label: string;           // Nom métier de la table
  description: string;     // Description de ce que représente la table
  icon?: string;           // Icône pour l'UI
  category?: 'client' | 'dossier' | 'finance' | 'procedure' | 'document' | 'organisation' | 'audit' | 'other' | string; // Catégorie métier
  ignored?: boolean;  
}

export function BusinessTable(metadata: BusinessTableMetadata) {
  return function (constructor: Function) {
    Reflect.defineMetadata(BUSINESS_METADATA_KEY, metadata, constructor);
  };
}

export function BusinessColumn(metadata: BusinessColumnMetadata) {
  return function (target: any, propertyKey: string) {
    const existingMetadata = Reflect.getMetadata(BUSINESS_METADATA_KEY, target, propertyKey) || {};
    Reflect.defineMetadata(BUSINESS_METADATA_KEY, { ...existingMetadata, ...metadata }, target, propertyKey);
  };
}