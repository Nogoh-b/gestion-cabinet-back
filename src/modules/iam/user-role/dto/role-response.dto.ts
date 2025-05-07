// role-response.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import { Permission } from '../../permission/entities/permission.entity';

export class RoleResponseDto {
  @Expose()
  @ApiProperty()
  id: number;

  @Expose()
  @ApiProperty()
  code: string;

  @Expose()
  @ApiProperty()
  name: string;

  @Expose()
  @ApiProperty()
  description: string;

  @Expose({ name: 'is_system_role' })
  @ApiProperty()
  isSystemRole: boolean;

  @ApiProperty({ type: [Permission] })
  @Transform(({ value }) => value.map((item: any) => item.permission))
  permissions: Permission[];
  
/*@Expose()
@ApiProperty({ type: [Permission] })
@Transform(({ value }) => 
  value?.map(rp => ({
    id: rp?.permission?.id,
    code: rp?.permission?.code,
    description: rp?.permission?.description
  })) || []
)
permissions: Permission[];*/
}