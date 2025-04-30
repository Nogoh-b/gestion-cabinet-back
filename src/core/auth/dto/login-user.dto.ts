// login-user.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString } from 'class-validator';

export class LoginUserDto {
  @ApiProperty({
    example: 'lionel',
    description: "Nom d'utilisateur"
  })
  @IsString()
  username: string;

  @ApiProperty({
    example: 'lionel',
    description: 'Mot de passe'
  })
  @IsString()
  password: string;
}