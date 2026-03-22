import { Expose, Transform, Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { EmployeePosition, EmployeeStatus } from '../entities/employee.entity';
import { UserResponseDto } from 'src/modules/iam/user/dto/user-response.dto';
import { BranchResponseDto } from '../../branch/dto/response-branch.dto';
import { MinimalDossierResponseDto } from 'src/modules/dossiers/dto/dossier-response.dto';

export class EmployeeResponseDto {
  // =========== PROPRIÉTÉS DE BASE ===========
  
  @ApiProperty({ example: 1, description: 'ID unique de l\'employé' })
  @Expose()
  id: number;

  @ApiProperty({ enum: EmployeePosition, example: EmployeePosition.AVOCAT })
  @Expose()
  position: EmployeePosition;
  
  @ApiProperty({ enum: EmployeePosition, example: EmployeePosition.AVOCAT })
  @Transform(({ obj }) =>
    obj.position
  )
  @Expose()
  role: EmployeePosition;

  @ApiProperty({ example: '2023-01-01', description: "Date d'embauche" })
  @Expose()
  hireDate: Date;

  @ApiProperty({ enum: EmployeeStatus, example: EmployeeStatus.ACTIVE })
  @Expose()
  status: EmployeeStatus;

  @ApiProperty({ example: 'Droit des affaires', description: 'Spécialisation' })
  @Expose()
  specialization: string;

  @ApiProperty({ example: 'A123456', description: "Numéro d'inscription au barreau" })
  @Expose()
  bar_association_number: string;

  @ApiProperty({ example: 'Paris', description: "Ville du barreau" })
  @Expose()
  bar_association_city: string;

  @ApiProperty({ example: 5, description: "Années d'expérience" })
  @Expose()
  years_of_experience: number;

  @ApiProperty({ example: 150.00, description: 'Taux horaire' })
  @Expose()
  hourly_rate: number;

  @ApiProperty({ example: true, description: "Disponibilité de l'employé" })
  @Expose()
  is_available: boolean;

  @ApiProperty({ example: 50, description: 'Nombre maximum de dossiers' })
  @Expose()
  max_dossiers: number;

  @ApiProperty({ example: 'Avocat spécialisé en droit commercial...', description: 'Biographie' })
  @Expose()
  bio: string;

  @ApiProperty({ example: ['Français', 'Anglais'], description: 'Langues parlées' })
  @Expose()
  languages: string[];

  @ApiProperty({ example: ['Droit des sociétés', 'Contrats'], description: "Domaines d'expertise" })
  @Expose()
  expertise_areas: string[];

  @ApiProperty({ example: 'EMP-AVO-2026-8YY3FB', description: "Numéro d'employé unique" })
  @Expose()
  employee_number: string;

  @ApiProperty({ example: '1990-01-01', description: 'Date de naissance' })
  @Expose()
  birth_date: Date;

  @ApiProperty({ example: '123 Rue du Palais, 75001 Paris', description: 'Adresse professionnelle' })
  @Expose()
  professional_address: string;

  @ApiProperty({ example: '+33 1 45 67 89 00', description: 'Téléphone professionnel' })
  @Expose()
  professional_phone: string;

  @ApiProperty({ example: 'MC123456789', description: "Numéro SIRET" })
  @Expose()
  siret_number: string;

  @ApiProperty({ example: 'FR12345678901', description: "Numéro de TVA" })
  @Expose()
  tva_number: string;

  // =========== RELATIONS ===========

  @ApiProperty({ type: () => UserResponseDto, description: 'Informations utilisateur associées' })
  @Expose()
  @Type(() => UserResponseDto)
  user: UserResponseDto;

  @ApiProperty({ type: () => BranchResponseDto, description: 'Agence de rattachement' })
  @Expose()
  @Type(() => BranchResponseDto)
  branch?: BranchResponseDto;

  // =========== GETTERS ===========

  @ApiProperty({ example: 'John Doe', description: 'Nom complet' })
  @Expose()
  full_name: string;

  @ApiProperty({ example: 'john.doe@example.com', description: 'Email' })
  @Expose()
  email: string;

  @ApiProperty({ example: '2025-07-09T02:02:56.000Z', description: 'Dernière connexion' })
  @Expose()
  lastSeen: string;

  @ApiProperty({ example: 'johndoe', description: "Nom d'utilisateur" })
  @Expose()
  username: string;

  @ApiProperty({ example: true, description: "Est en ligne" })
  @Expose()
  is_online: boolean;

  @ApiProperty({ example: true, description: "Est un avocat" })
  @Expose()
  is_avocat: boolean;

  @ApiProperty({ example: false, description: "Est un secrétaire" })
  @Expose()
  is_secretaire: boolean;

  @ApiProperty({ example: false, description: "Est un huissier" })
  @Expose()
  is_huissier: boolean;

  @ApiProperty({ example: 12, description: "Nombre de dossiers en cours" })
  @Expose()
  current_dossier_count: number;

  @ApiProperty({ example: true, description: "Peut accepter plus de dossiers" })
  @Expose()
  can_accept_more_dossiers: boolean;

  @Expose()
  @Type(() => MinimalDossierResponseDto)
  @Transform(({ obj }) => {
    if (!obj.collaborating_dossiers) return [];
    // Transformation explicite vers le DTO
    return obj.collaborating_dossiers.map(dossier => ({
      id: dossier.id,
      dossier_number: dossier.dossier_number,
      object: dossier.object,
      status: dossier.status,
      client_name: dossier.client?.full_name || null,
      lawyer_name: dossier.lawyer?.full_name || null,
      procedure_type: dossier.procedure_type?.name || null,
      opening_date: dossier.opening_date,
      danger_level: dossier.danger_level,
      priority_level: dossier.priority_level,
      is_active: dossier.is_active
    }));
  })
  collaborating_dossiers: MinimalDossierResponseDto[];

  @Expose()
  @Type(() => Number)
  @Transform(({ obj }) => {
    if (!obj.collaborating_dossiers) return 0;
    // Transformation explicite vers le DTO
    return obj.collaborating_dossiers.length
  })
  collaborating_dossiers_count: number;

  @ApiProperty({ example: true, description: "Est actif" })
  @Expose()
  is_active: boolean;

  @ApiProperty({ example: 'Confirmé', description: "Niveau d'expérience" })
  @Expose()
  experience_level: string;

  // =========== MÉTHODES EXPOSÉES ===========

  @ApiProperty({ example: true, description: "Peut gérer des dossiers" })
  @Expose()
  canManageDossiers: boolean;

  @ApiProperty({ example: true, description: "Peut valider des documents" })
  @Expose()
  canValidateDocuments: boolean;

  @ApiProperty({ 
    example: { particulier: 150, professionnel: 180, entreprise: 225 },
    description: "Tarifs selon le type de client" 
  })
  @Expose()
  rates_by_client_type: {
    particulier: number;
    professionnel: number;
    entreprise: number;
  };

  // =========== AUDIT ===========

  @ApiProperty({ example: '2025-11-18T17:45:02.121Z', description: 'Date de création' })
  @Expose()
  created_at: Date;

  @ApiProperty({ example: '2025-11-18T17:45:02.133Z', description: 'Date de mise à jour' })
  @Expose()
  updated_at: Date;

  @ApiProperty({ example: null, nullable: true, description: 'Date de suppression' })
  @Expose()
  deleted_at: Date | null;
}