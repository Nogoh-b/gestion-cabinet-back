// dto/create-procedure-instance.dto.ts
import { IsString, IsOptional } from 'class-validator';




export class CreateProcedureInstanceDto {
  @IsString()
  templateId: string;

  @IsString()
  title: string;
}

export class UpdateProcedureInstanceDto {
  @IsOptional()
  @IsString()
  title?: string;
}
