// user-role.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import { IsString, IsNotEmpty, IsBoolean, IsOptional } from 'class-validator';
import { Permission } from '../../permission/entities/permission.entity';

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
  @ApiProperty({ type: [Permission] })
  @Transform(({ obj }) => 
    obj.rolePermissions?.map(rp => rp.permission) || []
  )
  permissions: Permission[];
  
  @ApiProperty({ required: false, default: false })
  @IsBoolean()
  @IsOptional()
  isSystemRole?: boolean;

  @ApiProperty({ required: false })
  @IsOptional()
  status?: number;
}
