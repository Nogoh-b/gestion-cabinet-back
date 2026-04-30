// schema.interface.ts
export interface ColumnSchema {
  name: string;           // Nom technique
  type: string;           // Type détaillé
  constraints: string[];  // ['PK', 'NOT NULL', 'FK']
  businessLabel: string;  // Libellé métier
  description: string;    // Description
  isForeignKey: boolean;
  foreignKeyTo?: {
    table: string;
    column: string;
  };
}

export interface TableSchema {
  name: string;              // Nom technique
  businessName: string;      // Nom métier
  description: string;       // Description de la table
  rowCount: number;          // Nombre de lignes
  columns: ColumnSchema[];   // Liste des colonnes
  primaryKeys: string[];     // Clés primaires
  foreignKeys: {
    column: string;
    references: { table: string; column: string };
  }[];
  indexedColumns: string[];  // Colonnes indexées
}

export interface DatabaseSchema {
  database: string;
  generatedAt: string;
  tables: TableSchema[];
  relationships: {
    from: { table: string; column: string };
    to: { table: string; column: string };
  }[];
}