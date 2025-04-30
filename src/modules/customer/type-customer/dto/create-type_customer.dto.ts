// create-type-customer.dto.ts
import { IsString, IsInt, IsOptional } from 'class-validator';

export class CreateTypeCustomerDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  code?: string;

  @IsInt()
  @IsOptional()
  status?: number;
}
