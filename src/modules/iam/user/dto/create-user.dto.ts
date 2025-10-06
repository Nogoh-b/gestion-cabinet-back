// create-user.dto.ts
import { IsInt, IsString, IsEmail, IsNotEmpty, IsDateString, IsOptional, IsArray, IsBoolean, Min, IsNumber, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { EmployeePosition } from 'src/modules/agencies/employee/entities/employee.entity';


export class ResetPasswordRequestDto {
  // au moins l'un des deux doit être fourni
  @ApiProperty({ required: true, example: 'superadmin' })
  @IsOptional()
  @IsInt()
  id?: number;
}


export class CreateUserDto {


  @ApiProperty({ required: true, example: 'John' })
  @IsString()
  @IsNotEmpty()
  first_name: string;

  @ApiProperty({ required: true, example: 'Doe' })
  @IsString()
  @IsNotEmpty()
  last_name: string;

  @ApiProperty({ required: true, example: 'john.doe@cabinet-juridique.com' })
  @IsString()
  @IsEmail()
  email: string;

  @ApiProperty({ required: true, example: 'Password123!' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({ required: false, example: '+33123456789' })
  @IsString()
  @IsOptional()
  phone_number?: string;

  @ApiProperty({ enum: EmployeePosition, example: EmployeePosition.AVOCAT })
  @IsEnum(EmployeePosition)
  position: EmployeePosition;

  @ApiProperty({ required: true, example: 1 })
  @IsInt()
  branch_id: number;

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

  @ApiProperty({ required: false, example: 150.00 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  hourly_rate?: number;

  @ApiProperty({ required: false, example: true })
  @IsBoolean()
  @IsOptional()
  is_available?: boolean;

  @ApiProperty({ required: false, example: 50 })
  @IsInt()
  @Min(1)
  @IsOptional()
  max_dossiers?: number;

  @ApiProperty({ required: false, example: 'Avocat spécialisé en droit commercial...' })
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