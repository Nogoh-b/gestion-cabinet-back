// create-role-permission.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsInt } from 'class-validator';

export class CreateUserRoleAssignmentDto {
  @ApiProperty({ description: 'ID du rôle', example: 1 })
  @IsInt()
  role_id: number;



  @ApiProperty({ description: 'ID de l\'utilisateur', example: 1 })
  @IsInt()
  user_id: number;

  @ApiProperty({ 
    description: 'Statut de l\'assignation', 
    example: 1, 
    required: false 
  })

  status?: number;
}