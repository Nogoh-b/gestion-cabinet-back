// login-user.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class LoginUserDto {
  @ApiProperty({
    example: 'superadmin',
    description: "Nom d'utilisateur"
  })
  @IsString()
  username: string;

  @ApiProperty({
    example: 'Admin@1234',
    description: 'Mot de passe'
  })
  @IsString()
  password: string;
}