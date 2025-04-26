import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsInt } from 'class-validator';

export class AssignPermissionDto {
  @ApiProperty({ type: [Number] })
  @IsArray()
  @IsInt({ each: true })
  permissionIds: number[];
}