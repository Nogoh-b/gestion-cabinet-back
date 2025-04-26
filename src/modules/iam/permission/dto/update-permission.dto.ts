import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdatePermissionDto {
  @ApiProperty({ required: false })
  @IsBoolean()
  @IsOptional()
  status?: number;
}