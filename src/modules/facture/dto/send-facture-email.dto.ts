import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional } from 'class-validator';

export class SendFactureEmailDto {
  @ApiPropertyOptional({
    description:
      "Adresse destinataire. Si elle est omise, l'adresse e-mail du client est utilisée.",
    example: 'client@example.com',
  })
  @IsEmail()
  @IsOptional()
  email?: string;
}
