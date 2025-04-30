// create-role-permission.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional } from 'class-validator';

export class CreateRolePermissionDto {
  @ApiProperty({ description: 'ID du rôle', example: 1 })
  @IsInt()
  role_id: number;

  @ApiProperty({ description: 'ID de la permission', example: 1 })
  @IsInt()
  permission_id: number;

  @ApiProperty({ 
    description: 'Statut de l\'assignation', 
    example: 1, 
    required: false 
  })
  @IsOptional()
  @IsInt()
  status?: number;
}