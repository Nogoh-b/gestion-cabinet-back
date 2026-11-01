import { IsArray, IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { SourceModule, TypeJournal } from '../enums/comptabilite.enums';

export class CreateLigneDto {
  @IsString() @IsNotEmpty()
  numeroCompte: string;

  @IsNumber()
  debit: number;

  @IsNumber()
  credit: number;

  @IsOptional() @IsString()
  libelle?: string;
}

export class CreateEcritureDto {
  @IsDateString()
  dateEcriture: string;

  @IsString() @IsNotEmpty()
  libelle: string;

  @IsEnum(TypeJournal)
  codeJournal: TypeJournal;

  @IsOptional() @IsEnum(SourceModule)
  sourceModule?: SourceModule;

  @IsOptional() @IsString()
  sourceId?: string;

  @IsOptional() @IsString()
  idempotencyKey?: string;

  @IsArray() @ValidateNested({ each: true }) @Type(() => CreateLigneDto)
  lignes: CreateLigneDto[];
}
