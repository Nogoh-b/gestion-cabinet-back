// src/modules/procedures/dto/procedure-type-response.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';

export class ProcedureTypeResponseDto {
  @ApiProperty({
    description: 'ID du type de procédure',
    example: 2
  })
  @Expose()
  id: number;

  @ApiProperty({
    description: 'Nom du type de procédure',
    example: 'Civile'
  })
  @Expose()
  name: string;

  @ApiProperty({
    description: 'Code unique',
    example: 'CIVILE'
  })
  @Expose()
  code: string;

  @ApiPropertyOptional({
    description: 'Description'
  })
  @Expose()
  description?: string;

  @ApiProperty({
    description: 'Est un sous-type',
    example: false
  })
  @Expose()
  is_subtype: boolean;

  @ApiPropertyOptional({
    description: 'Niveau de hiérarchie',
    example: 1
  })
  @Expose()
  hierarchy_level?: number;

  @ApiPropertyOptional({
    description: 'Documents requis'
  })
  @Expose()
  required_documents?: string[];

  @ApiPropertyOptional({
    description: 'Durée moyenne en jours',
    example: 180
  })
  @Expose()
  average_duration?: number;

  @ApiPropertyOptional({
    description: 'Juridictions spécifiques'
  })
  @Expose()
  specific_jurisdictions?: string[];

  @ApiProperty({
    description: 'Type actif',
    example: true
  })
  @Expose()
  is_active: boolean;

  @ApiPropertyOptional({
    description: 'ID du type parent (pour les sous-types)',
    example: 2
  })
  @Expose()
  parent_id?: number;

  @ApiPropertyOptional({
    description: 'Type parent (pour les sous-types)'
  })
  @Expose()
  @Transform(({ obj }) => obj.parent ? {
    id: obj.parent.id,
    name: obj.parent.name,
    code: obj.parent.code
  } : null)
  parent?: {
    id: number;
    name: string;
    code: string;
  };

  @ApiPropertyOptional({
    description: 'Sous-types (pour les types principaux)'
  })
  @Expose()
  @Transform(({ obj }) => obj.subtypes ? obj.subtypes.map(subtype => ({
    id: subtype.id,
    name: subtype.name,
    code: subtype.code,
    is_active: subtype.is_active
  })) : [])
  subtypes?: {
    id: number;
    name: string;
    code: string;
    is_active: boolean;
  }[];

  // ✅ Derniers dossiers (limités à 5)
  @ApiPropertyOptional({
    description: 'Derniers dossiers utilisant ce type (limité à 5)',
    example: [
      { id: 101, numero: 'DOS-2024-001', status: 'en_cours' },
      { id: 102, numero: 'DOS-2024-002', status: 'termine' }
    ]
  })
  @Expose()
  @Transform(({ obj }) => obj.dossiers ? obj.dossiers.map(dossier => ({
    id: dossier.id,
    dossier_number: dossier.dossier_number,
    status: dossier.status,
    date_creation: dossier.created_at
  })) : [])
  dossiers?: {
    id: number;
    numero: string;
    status: string;
    date_creation?: Date;
  }[];

  // ✅ Compteurs uniquement
  @ApiProperty({
    description: 'Nombre total de dossiers utilisant ce type',
    example: 15
  })
  @Expose()
  @Transform(({ obj }) => obj.dossiers?.length || 0)
  dossiers_count: number;

  @ApiProperty({
    description: 'Statistiques des dossiers par statut',
    example: { en_cours: 5, termines: 8, annules: 2 }
  })
  @Expose()
  @Transform(({ obj }) => {
    if (!obj.dossiers) return {};
    
    const stats = {};
    obj.dossiers.forEach(dossier => {
      const status = dossier.status || 'non_defini';
      stats[status] = (stats[status] || 0) + 1;
    });
    return stats;
  })
  dossiers_stats?: Record<string, number>;

  // Les autres getters restent inchangés
  @ApiProperty({
    description: 'Chemin complet',
    example: 'Civile > Divorce'
  })
  @Expose()
  full_path: string;

  @ApiProperty({
    description: 'Est un type principal',
    example: true
  })
  @Expose()
  is_main_type: boolean;

  @ApiProperty({
    description: 'Est une feuille (pas de sous-types)',
    example: true
  })
  @Expose()
  is_leaf: boolean;

  @ApiProperty({
    description: 'A des sous-types',
    example: false
  })
  @Expose()
  has_subtypes: boolean;

  @ApiProperty({
    description: 'Nombre de sous-types',
    example: 3
  })
  @Expose()
  subtypes_count: number;

  @ApiProperty({
    description: 'Nombre de documents requis',
    example: 5
  })
  @Expose()
  document_count: number;

  @ApiProperty({
    description: 'A des documents requis',
    example: true
  })
  @Expose()
  has_required_documents: boolean;

  @ApiProperty({
    description: 'Liste des documents requis',
    example: 'Acte de naissance, Pièce d\'identité'
  })
  @Expose()
  required_documents_list: string;

  @ApiProperty({
    description: 'Nombre de juridictions spécifiques',
    example: 2
  })
  @Expose()
  jurisdictions_count: number;

  @ApiProperty({
    description: 'A des juridictions spécifiques',
    example: true
  })
  @Expose()
  has_specific_jurisdictions: boolean;

  @ApiProperty({
    description: 'Liste des juridictions spécifiques',
    example: 'Paris, Lyon'
  })
  @Expose()
  specific_jurisdictions_list: string;

  @ApiProperty({
    description: 'Affichage formaté de la durée',
    example: 'environ 6 mois'
  })
  @Expose()
  duration_display: string;

  @ApiProperty({
    description: 'Affichage du statut',
    example: 'Actif'
  })
  @Expose()
  status_display: string;

  @ApiProperty({
    description: 'Couleur du statut',
    example: 'green'
  })
  @Expose()
  status_color: string;

  @ApiProperty({
    description: 'Affichage du type',
    example: 'Type principal'
  })
  @Expose()
  type_display: string;

  @ApiProperty({
    description: 'Affichage du niveau hiérarchique',
    example: 'Niveau 1'
  })
  @Expose()
  hierarchy_level_display: string;

  @ApiProperty({
    description: 'Chemin hiérarchique avec codes',
    example: 'Civile (CIV) → Divorce (DIV)'
  })
  @Expose()
  hierarchy_path_with_codes: string;

  @ApiProperty({
    description: 'Résumé de la procédure',
    example: {
      id: 1,
      name: 'Mariage',
      code: 'MARIAGE',
      type: 'Type principal',
      status: 'Actif'
    }
  })
  @Expose()
  summary: Record<string, any>;

  @ApiProperty({
    description: 'Affichage arborescent',
    example: '📁 Civile (CIV) ✅'
  })
  @Expose()
  tree_display: string;

  @ApiPropertyOptional({
    description: 'Date de création'
  })
  @Expose()
  created_at?: Date;

  @ApiPropertyOptional({
    description: 'Date de dernière modification'
  })
  @Expose()
  updated_at?: Date;
} 