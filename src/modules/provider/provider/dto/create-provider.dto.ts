import { IsString, IsOptional, IsNumber, IsUrl } from 'class-validator';

export class CreateProviderDto {
  @IsString()
  code: string;

  @IsString()
  name: string;

  @IsOptional()
  @IsNumber()
  status?: number;

  @IsOptional()
  @IsUrl()
  api_endpoint?: string;

  @IsOptional()
  @IsString()
  country_id?: string;
}