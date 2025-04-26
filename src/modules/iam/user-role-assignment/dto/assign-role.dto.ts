// src/iam/user-role-assignment/dto/assign-role.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsInt } from 'class-validator';

export class AssignRoleDto {
  @ApiProperty()
  @IsInt()
  userId: number;

  @ApiProperty()
  @IsInt()
  roleId: number;

  @ApiProperty()
  @IsInt()
  assignedBy: number; // ID de l'utilisateur qui attribue le rôle
}