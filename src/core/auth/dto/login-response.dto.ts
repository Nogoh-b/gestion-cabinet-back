import { ApiProperty } from '@nestjs/swagger';

export class LoginResponseDto {
  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'JWT Access Token'
  })
  access_token: string;

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