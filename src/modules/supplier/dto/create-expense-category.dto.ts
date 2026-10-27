import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateExpenseCategoryDto {
  @ApiProperty({ example: 'Transport', description: 'Libellé affiché' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  label: string;

  @ApiPropertyOptional({ example: true, description: 'Actif', default: true })
  @IsBoolean()
  @IsOptional()
  status?: boolean;
}
