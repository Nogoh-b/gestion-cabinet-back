// create-user.dto.ts
import {
  IsInt,
  IsString,
  IsEmail,
  IsDateString,
  IsOptional,
  IsArray,
  IsBoolean,
  Min,
  IsNumber,
  IsEnum,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  EmployeePosition,
  MaritalStatus,
} from 'src/modules/agencies/employee/entities/employee.entity';
import { UserRole } from 'src/core/enums/user-role.enum';

export class ResetPasswordRequestDto {
  // au moins l'un des deux doit être fourni
  @ApiProperty({ required: true, example: 'superadmin' })
  @IsOptional()
  @IsInt()
  id?: number;
}

export class CreateUserDto {
  /**
   * Nom et prénom en un seul champ — c'est ce que les formulaires de création
   * envoient désormais. `first_name`/`last_name` restent acceptés (compat
   * ascendante) et, si fournis seuls, priment ; le service dérive le champ
   * manquant via `splitFullName`/`joinFullName`. Au moins l'un des deux doit
   * permettre de reconstituer un nom — voir `EmployeeService.createEmployee`.
   */
  @ApiPropertyOptional({
    example: 'John Doe',
    description: 'Nom et prénom (champ unique)',
  })
  @IsString()
  @IsOptional()
  full_name?: string;

  @ApiPropertyOptional({ example: 'John' })
  @IsString()
  @IsOptional()
  first_name?: string;

  @ApiPropertyOptional({ example: 'Doe' })
  @IsString()
  @IsOptional()
  last_name?: string;

  /**
   * Facultatif : création minimale (depuis un select « + Créer », uniquement
   * `full_name`) laisse l'email vide — `EmployeeService.createEmployee`
   * génère alors un identifiant de connexion (`username`) à partir du nom et
   * laisse `email` à `NULL` (champ « à compléter » sur la fiche employé).
   */
  @ApiPropertyOptional({ example: 'john.doe@cabinet-juridique.com' })
  @IsString()
  @IsEmail()
  @IsOptional()
  email?: string;

  @ApiPropertyOptional({
    example: 'Password123!',
    description:
      'Ignoré à la création : un mot de passe temporaire est toujours généré par le service.',
  })
  @IsString()
  @IsOptional()
  password?: string;

  @ApiProperty({ required: false, example: '+33123456789' })
  @IsString()
  @IsOptional()
  phone_number?: string;

  @ApiPropertyOptional({
    enum: EmployeePosition,
    example: EmployeePosition.AVOCAT,
    description: 'Fonction. Défaut : collaborateur.',
  })
  @IsEnum(EmployeePosition)
  @IsOptional()
  position?: EmployeePosition;

  @ApiProperty({
    required: false,
    enum: UserRole,
    example: 'avocat',
    description: "Code du profil d'accès. À défaut, il est déduit du poste.",
  })
  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @ApiPropertyOptional({
    example: 1,
    description: 'Agence de rattachement. Défaut : première agence active.',
  })
  @IsInt()
  @IsOptional()
  branch_id?: number;

  @ApiProperty({ required: false, example: '2024-01-15' })
  @IsDateString()
  @IsOptional()
  hire_date?: string;

  // Champs spécifiques employé
  @ApiProperty({ required: false, example: 'Droit des affaires' })
  @IsString()
  @IsOptional()
  specialization?: string;

  @ApiProperty({ required: false, example: 'A123456' })
  @IsString()
  @IsOptional()
  bar_association_number?: string;

  @ApiProperty({ required: false, example: 'Paris' })
  @IsString()
  @IsOptional()
  bar_association_city?: string;

  @ApiProperty({ required: false, example: 5 })
  @IsInt()
  @Min(0)
  @IsOptional()
  years_of_experience?: number;

  @ApiProperty({ required: false, example: 150.0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  hourly_rate?: number;

  @ApiProperty({
    required: false,
    example: 350000,
    description: 'Salaire mensuel de base',
  })
  @IsNumber()
  @Min(0)
  @IsOptional()
  salary?: number;

  @ApiProperty({ required: false, example: true })
  @IsBoolean()
  @IsOptional()
  is_available?: boolean;

  @ApiProperty({ required: false, example: 50 })
  @IsInt()
  @Min(1)
  @IsOptional()
  max_dossiers?: number;

  @ApiProperty({
    required: false,
    example: 'Avocat spécialisé en droit commercial...',
  })
  @IsString()
  @IsOptional()
  bio?: string;

  @ApiProperty({ required: false, example: ['Français', 'Anglais'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  languages?: string[];

  @ApiProperty({ required: false, example: ['Droit des sociétés', 'Contrats'] })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  expertise_areas?: string[];

  @ApiProperty({ required: false, example: '1990-01-01' })
  @IsDateString()
  @IsOptional()
  birth_date?: string;

  @ApiProperty({ required: false, example: 'Douala' })
  @IsString()
  @IsOptional()
  birth_place?: string;

  @ApiProperty({
    required: false,
    example: 'Akwa, Douala',
    description: 'Ville / adresse personnelle',
  })
  @IsString()
  @IsOptional()
  home_address?: string;

  @ApiProperty({ required: false, example: '+237 690 00 00 00' })
  @IsString()
  @IsOptional()
  personal_phone?: string;

  @ApiProperty({
    required: false,
    enum: MaritalStatus,
    example: MaritalStatus.MARRIED,
  })
  @IsEnum(MaritalStatus)
  @IsOptional()
  marital_status?: MaritalStatus;

  @ApiProperty({ required: false, example: 2 })
  @IsInt()
  @Min(0)
  @IsOptional()
  children_count?: number;

  @ApiProperty({ required: false, example: '123 Rue du Palais, 75001 Paris' })
  @IsString()
  @IsOptional()
  professional_address?: string;

  @ApiProperty({ required: false, example: '+33 1 45 67 89 00' })
  @IsString()
  @IsOptional()
  professional_phone?: string;

  @ApiProperty({ required: false, example: '12345678901234' })
  @IsString()
  @IsOptional()
  siret_number?: string;

  @ApiProperty({ required: false, example: 'FR12345678901' })
  @IsString()
  @IsOptional()
  tva_number?: string;
}
