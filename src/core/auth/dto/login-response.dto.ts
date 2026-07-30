import { ApiProperty } from '@nestjs/swagger';

export class LoginResponseDto {
  @ApiProperty({
    example: true,
    description: 'La session a été créée dans des cookies HttpOnly'
  })
  authenticated: boolean;

  @ApiProperty({
    example: {
      id: 1,
      username: 'admin',
      roles: ['ADMIN']
    },
    description: 'Informations utilisateur'
  })
  user: {
    id: number;
    username: string;
    roles: string[];
  };
}
