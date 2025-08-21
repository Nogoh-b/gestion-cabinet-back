// create-role-permission.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { Expose, Transform } from 'class-transformer';
import { UserRole } from '../../user-role/entities/user-role.entity';

export class CreateUserRoleAssignmentResponseDto {
  @Expose()
  @ApiProperty({ type: [UserRole] })
  @Transform(({ obj }) => 
    obj.roleAssignments?.map(assignment => assignment.role) || []
  )
  roles: UserRole[];
}