// 
import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Transform } from 'class-transformer';

export class UserResponseDto {
  @Expose()
  @ApiProperty()
  id: number;

  @Expose()
  @ApiProperty()
  username: string;

  @Expose()
  @ApiProperty()
  status: number;

  @Expose()
  @ApiProperty()
  refreshToken: string;

  @Expose()
  @ApiProperty({ enum: ['caisse', 'comptable', 'DG', 'DAF', 'PCA'] })
  type: string;

  @Expose({ name: 'customer_id' })
  @ApiProperty()
  @Transform(({ obj }) => obj.customer?.id)
  customer_id: number;

  /*@Expose()
  @ApiProperty({ type: [UserRole] })
  @Transform(({ obj }) => 
    obj.roleAssignments?.map(assignment => assignment.role) || []
  )
  roles: UserRole[];*/

  @Expose()
  @ApiProperty()
  @Transform(({ obj }) =>
    obj.roleAssignments?.find(a => a.role?.status === 1)?.role?.code || null
  )
  role: string;

  @Expose()
  @ApiProperty()
  @Transform(({ obj }) =>
    obj.roleAssignments?.find(a => a.role?.status === 1)?.role?.description || null
  )
  roleDescription: string;

  @Expose({ name: 'created_at' })
  @ApiProperty()
  create_at: Date;

  @Exclude()
  roleAssignments: any; 

  @Exclude()
  password: string; 

  @Expose({ name: 'updated_at' })
  @ApiProperty()
  update_at: Date;
}