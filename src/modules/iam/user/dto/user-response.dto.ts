// 
import { ApiProperty } from '@nestjs/swagger';
import { Exclude, Expose, Transform } from 'class-transformer';
import { UserRole } from '../../user-role/entities/user-role.entity';

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
  customerId: number;

  @Expose()
  @ApiProperty({ type: [UserRole] })
  @Transform(({ obj }) => 
    obj.roleAssignments?.map(assignment => assignment.role) || []
  )
  roles: UserRole[];

  @Expose({ name: 'created_at' })
  @ApiProperty()
  createdAt: Date;

  @Exclude()
  roleAssignments: any; 

  @Exclude()
  password: string; 

  @Expose({ name: 'updated_at' })
  @ApiProperty()
  updatedAt: Date;
}