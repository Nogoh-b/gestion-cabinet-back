import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ValidateDocumentVersionDto {
  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  signatureValue?: string;
}

export class RejectDocumentVersionDto {
  @IsString()
  @IsNotEmpty()
  reason: string;
}

export class RevokeDocumentVersionDto extends RejectDocumentVersionDto {}
