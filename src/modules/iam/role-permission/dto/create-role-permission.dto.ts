// create-role-permission.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsInt } from 'class-validator';

export class CreateRolePermissionDto {
  @ApiProperty({ description: 'ID du rôle', example: 1 })
  @IsInt()
  role_id: number;

  @ApiProperty({ description: 'ID de la permission', example:[2,3] })
  @IsInt()
  permission_ids: number[];  



}