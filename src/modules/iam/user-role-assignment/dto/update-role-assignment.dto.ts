// src/iam/user-role-assignment/dto/update-role-assignment.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsInt } from 'class-validator';

export class UpdateRoleAssignmentDto {
  @ApiProperty({ enum: [0, 1], description: '0 = Inactif, 1 = Actif' })
  @IsInt()
  status: number;
}