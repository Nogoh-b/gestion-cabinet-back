import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { DisputeSeverity } from '../entities/transaction-dispute.entity';
import { PaginationQueryDto } from 'src/core/shared/dto/pagination-query.dto';

export class CreateTransactionDisputeDto {
  @IsInt()
  transaction_id: number;

  @IsOptional()
  @IsString()
  description?: string;
}


export class SearchDisputeQueryDto extends PaginationQueryDto {


  @IsOptional()
  @IsEnum(DisputeSeverity)
  @ApiPropertyOptional({ enum: DisputeSeverity, example: DisputeSeverity.HIGH })
  severity?: DisputeSeverity;

 

  /*@IsOptional()
  @IsString()
  @ApiPropertyOptional({
    example: 'paiement',
    description: 'Recherche dans description et resolution_notes'
  })*/
  search?: string;

  @IsOptional()
  @ApiPropertyOptional({ example: 'OM' })
  provider_code?: string;

  @IsOptional()
  @ApiPropertyOptional({ example: 'REF123456' })
  reference?: string;

  @IsOptional()
  @ApiPropertyOptional({ example: 'TXN-001' })
  payment_code?: string;

  /*@IsOptional()
  @ApiPropertyOptional({ example: 'FAILED' })*/
  status_provider?: string;
}
