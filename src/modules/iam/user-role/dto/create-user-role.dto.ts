// user-role.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { Expose } from 'class-transformer';
import { IsString, IsNotEmpty, IsBoolean, IsOptional } from 'class-validator';

export class CreateUserRoleDto {
  @ApiProperty({ example: 'ADMIN', description: 'Code rôle unique' })
  @IsString()
  @IsNotEmpty()
  code: string;

  @ApiProperty({ example: 'Administrateur', description: 'Nom du rôle' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiProperty({ required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @Expose()
  @ApiProperty({
    type: [Number],
    example: [1, 3],
    description: 'Liste des permissions',
  })
  permissions_ids: number[];

  @ApiProperty({ required: false, default: false })
  @IsBoolean()
  @IsOptional()
  isSystemRole?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  status?: number;
}
