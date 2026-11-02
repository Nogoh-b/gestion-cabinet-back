import { Type } from 'class-transformer';
import {
  IsDate,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateCreditNoteDto {
  @IsNumber()
  montantHT: number;

  @IsNumber()
  tauxTVA: number;

  @IsNumber()
  montantTVA: number;

  @IsNumber()
  montantTTC: number;

  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  raison: string;

  @IsOptional()
  @IsDate()
  @Type(() => Date)
  dateFacture?: Date;
}

export class InvoiceDispositionDto {
  @IsString()
  @MinLength(10)
  @MaxLength(2000)
  raison: string;
}
