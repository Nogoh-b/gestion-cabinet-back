// create-role-permission.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt } from 'class-validator';

export class CreateRolePermissionDto {
  @ApiProperty({ description: 'ID du rôle', example: 1, required: true, })
  @IsInt()
  role_id: number;

  @ApiProperty({
    description: 'ID de la permission',
    example: [2, 3],
    required: true,
  })
  @IsArray()
  permissions_ids: number[];
}