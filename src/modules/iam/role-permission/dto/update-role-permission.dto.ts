import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsIn } from 'class-validator';

export class UpdateRolePermissionDto {
  @ApiProperty({ 
    description: 'Statut (0 = Inactif, 1 = Actif)',
    enum: [0, 1],
  })
  @IsInt()
  @IsIn([0, 1])
  status: number;
}