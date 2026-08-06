// src/modules/dossiers/dto/create-dossier.dto.ts
import {
  IsNotEmpty,
  IsString,
  IsUUID, IsOptional,
  IsDateString,
  IsNumber,
  IsInt,
  Min,
  Max,
  IsArray,
  IsBoolean,
  ValidateIf,
  IsEnum,
  Allow
} from 'class-validator';
import { Transform } from 'class-transformer';
import { ConflictCheckStatus } from '../entities/dossier.entity';
import { PriorityLevel } from 'src/core/enums/dossier-status.enum';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';


import { DangerLevel } from '../entities/dossier.entity';


export class LinkDocumentsToSubStageDto {
  @ApiProperty({
    description: 'IDs des documents à lier',
    example: [1, 2, 3],
    type: [Number],
  })
  @IsArray()
  @IsNotEmpty()
  // @ArrayMinSize(1)
  document_ids: number[];

  @ApiProperty({
    description: 'ID du dossier (UUID)',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsUUID()
  @IsNotEmpty()
  dossier_id: string;
}

/**
 * DTO pour uploader un document directement depuis le contexte d'un dossier
 * et le lier automatiquement à une visite de sous-étape.
 *
 * - dossier_id et customer_id sont résolus côté serveur via l'ID du dossier passé en URL.
 * - sub_stage_visit_id / stage_visit_id sont optionnels :
 *   si absents, le document n'est pas lié à un contexte de procédure spécifique.
 */
export class UploadDocumentToSubStageDto {
  @ApiProperty({ description: 'ID du type de document', example: 1 })
  @IsNumber()
  @IsNotEmpty()
  document_type_id: number;

  @ApiProperty({ description: 'ID de la catégorie du document', example: 2 })
  @IsNumber()
  @IsNotEmpty()
  category_id: number;

  @ApiPropertyOptional({ description: 'Nom du document' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ description: 'Description du document' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ description: 'Document confidentiel' })
  @IsBoolean()
  @IsOptional()
  is_confidential?: boolean;

  @ApiPropertyOptional({ description: 'ID UUID de la visite de sous-étape à laquelle lier le document' })
  @IsUUID()
  @IsOptional()
  sub_stage_visit_id?: string;

  @ApiPropertyOptional({ description: 'ID UUID de la visite d\'étape à laquelle lier le document' })
  @IsUUID()
  @IsOptional()
  stage_visit_id?: string;
}



export class CreateDossierDto {
  @ApiProperty({
    description: 'Objet du dossier',
    example: 'Litige contractuel avec fournisseur XYZ',
    maxLength: 500
  })
  @IsNotEmpty()
  @IsString()
  object: string;

  @ApiProperty({
    description: 'ID de la juridiction compétente (legacy, utiliser jurisdiction_id)',
    example: 3,
    required: false,
  })
  @IsOptional()
  @IsInt()
  jurisdiction?: number;

  @ApiProperty({
    description: 'Niveau de danger',
    example: 1,
    enum: ['Faible', 'Normal', 'Eleve', 'Critique'],
    default: 'Normal'
  })
  @IsOptional()
  @IsEnum(DangerLevel, { message: 'danger_level doit être une des valeurs : Faible, Normal, Eleve, Critique' })
  danger_level?: DangerLevel;

  @ApiProperty({
    description: 'ID de la juridiction compétente',
    example: 3,
    required: false,
  })
  @IsOptional()
  @IsInt()
  jurisdiction_id?: number;

  @ApiProperty({
    description: 'ID du client',
    example: 5
  })
  @IsNotEmpty()
  @IsNumber()
  client_id: number;

  @ApiProperty({
    description: 'ID de l\'avocat responsable',
    example: 2
  })
  @IsNotEmpty()
  @IsNumber()
  lawyer_id: number;

  @ApiProperty({
    description: 'ID du type de procédure',
    example: 11
  })
  @IsNotEmpty()
  @IsNumber()
  procedure_type_id: number;

  @ApiProperty({
    description: 'ID du sous-type de procédure',
    example: 2
  })
  @IsNotEmpty()
  @IsNumber()
  procedure_subtype_id: number;

  @ApiPropertyOptional({
    description: 'Nom du tribunal',
    example: 'Tribunal de Grande Instance de Paris',
    maxLength: 255
  })
  @IsOptional()
  @IsString()
  court_name?: string;

  @ApiPropertyOptional({
    description: 'Numéro d\'affaire au tribunal',
    example: 'RG-2024-12345',
    maxLength: 100
  })
  @IsOptional()
  @IsString()
  dossier_number?: string;

  @ApiPropertyOptional({
    description: 'Nom de la partie adverse',
    example: 'SARL Fournisseur XYZ',
    maxLength: 255
  })
  @IsOptional()
  @IsString()
  opposing_party_name?: string;

  @ApiPropertyOptional({
    description: 'Avocat de la partie adverse',
    example: 'Maître Dupont',
    maxLength: 255
  })
  @IsOptional()
  @IsString()
  opposing_party_lawyer?: string;

  @ApiPropertyOptional({
    description: 'Coordonnées de la partie adverse',
    example: 'contact@fournisseur-xyz.com - 01 23 45 67 89'
  })
  @IsOptional()
  @IsString()
  opposing_party_contact?: string;

  @ApiPropertyOptional({
    description: 'Tiers impliqués dans l\'affaire',
    example: 'Expert comptable, Huissier de justice'
  })
  @IsOptional()
  @IsString()
  third_parties?: string;

  @ApiPropertyOptional({
    description: 'Description détaillée du dossier',
    example: 'Litige portant sur la non-conformité des marchandises livrées dans le cadre du contrat signé le 15/01/2024.'
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({
    description: 'Demande initiale du client',
    example: 'Indemnisation de 50 000 € pour préjudice commercial'
  })
  @IsOptional()
  @IsString()
  initial_request?: string;

  @ApiPropertyOptional({
    description: 'Date d\'ouverture du dossier (format YYYY-MM-DD)',
    example: '2024-01-15'
  })
  @IsOptional()
  @IsDateString()
  opening_date?: string;

  @ApiPropertyOptional({
    // description: 'Date d\'ouverture du dossier (format YYYY-MM-DD)',
    example: 'AEDDDD'
  })
  @IsOptional()
  @IsString()
  case_number?: string; 

  @ApiPropertyOptional({
    description: 'Durée estimée en jours',
    example: 180,
    minimum: 1
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  estimated_duration?: number;

  @ApiPropertyOptional({
    description: 'Niveau de confidentialité',
    example: false,
    default: false
  })
  @IsOptional()
  @Transform(({ value }) => value === '' ? undefined : value)
  @IsBoolean()
  confidentiality_level?: boolean;

  @IsOptional()
  @IsEnum(PriorityLevel, { message: 'priority_level doit être une des valeurs : low, medium, high, urgent' })
  priority_level?: PriorityLevel;
  @ApiPropertyOptional({
    description: 'Budget estimé en euros',
    example: 15000.00,
    minimum: 0
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  budget_estimate?: number;

  @ApiPropertyOptional({
    description: 'Probabilité de succès en pourcentage',
    example: 75,
    minimum: 0,
    maximum: 100
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  success_probability?: number;

  @ApiPropertyOptional({
    description: 'IDs des collaborateurs supplémentaires',
    example: [4,5,6],
    type: [Number]
  })
  @IsOptional()
  @Transform(({ value }) => Array.isArray(value) ? value : undefined)
  @IsArray()
  @IsInt({ each: true })
  collaborator_ids: number[];

  // Champs internes envoyés par d'anciens modals : acceptés puis ignorés.
  @Allow()
  @IsOptional()
  notes?: string;

  @Allow()
  @IsOptional()
  mode?: string;

  @ApiPropertyOptional({
    description: 'Frais de procédure estimés',
    example: 2000.00,
    minimum: 0
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  procedure_costs?: number;

  @ApiPropertyOptional({
    description: 'Montant de l\'avance sur honoraires',
    example: 5000.00,
    minimum: 0
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  fees_advanced?: number;

  @ApiPropertyOptional({
    description: 'Type de facturation',
    example: 'hourly',
    enum: ['fixed', 'hourly', 'mixed', 'contingency'],
    default: 'hourly'
  })
  @IsOptional()
  @IsString()
  billing_type?: string;

  @ApiPropertyOptional({
    description: 'Date de l\'événement litigieux',
    example: '2023-12-01'
  })
  @IsOptional()
  @IsDateString()
  dispute_date?: string;

  @ApiPropertyOptional({
    description: 'Montant du litige en euros',
    example: 50000.00,
    minimum: 0
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  dispute_amount?: number;

  @ApiPropertyOptional({
    description: 'Délai de prescription',
    example: '2026-12-01'
  })
  @IsOptional()
  @IsDateString()
  statute_of_limitations?: string;

  @ApiPropertyOptional({
    description: 'Documents requis pour l\'ouverture',
    example: ['contrat', 'factures', 'correspondance']
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  required_documents?: string[];

  @ApiPropertyOptional({
    description: 'Mots-clés pour la recherche',
    example: ['litige commercial', 'contrat', 'fournisseur']
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  keywords?: string[];

  @ApiPropertyOptional({
    description: 'Validation automatique du dossier',
    example: false,
    default: false
  })
  @IsOptional()
  @IsBoolean()
  auto_validate?: boolean = false;

  /**
   * Coché par l'utilisateur dans le modal de création.
   * Champ transient : non persisté en colonne, lu uniquement par le subscriber
   * pour déclencher l'e-mail client via le NotificationDispatcher.
   */
  @ApiPropertyOptional({
    description: 'Notifier le client par e-mail à la création du dossier',
    example: true,
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  notify_client?: boolean = false;

  @ApiPropertyOptional({ enum: ConflictCheckStatus })
  @IsOptional()
  @IsEnum(ConflictCheckStatus)
  conflict_check_status?: ConflictCheckStatus;

  @ApiPropertyOptional({ description: 'Justification du contrôle de conflit' })
  @IsOptional()
  @IsString()
  conflict_check_notes?: string;

  @ApiPropertyOptional({ description: 'Identifiant du mandat ou de la lettre d’engagement' })
  @IsOptional()
  @IsNumber()
  engagement_document_id?: number;

  @ApiPropertyOptional({ description: 'Conditions financières validées' })
  @IsOptional()
  @IsBoolean()
  financial_terms_confirmed?: boolean;

  // Validation conditionnelle
  @ValidateIf(o => o.billing_type === 'hourly' || o.billing_type === 'mixed')
  @IsNumber()
  @Min(0)
  @ApiPropertyOptional({
    description: 'Taux horaire (requis si billing_type = hourly ou mixed)',
    example: 150.00
  })
  hourly_rate?: number;

  @ValidateIf(o => o.billing_type === 'fixed')
  @IsNumber()
  @Min(0)
  @ApiPropertyOptional({
    description: 'Forfait (requis si billing_type = fixed)',
    example: 10000.00
  })
  fixed_fee?: number;
}
