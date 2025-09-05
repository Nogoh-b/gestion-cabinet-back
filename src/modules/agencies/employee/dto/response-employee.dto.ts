// 
import { Exclude, Expose, Transform } from 'class-transformer';
import { Branch } from 'src/modules/agencies/branch/entities/branch.entity';
import { Customer } from 'src/modules/customer/customer/entities/customer.entity';
import { ApiProperty } from '@nestjs/swagger';
















export class EmployeeResponseDto {
  @Expose()
  @ApiProperty()
  @Transform(({ obj }) => obj.user?.id)
  id: number;

  @Expose()
  @ApiProperty()
  @Transform(({ obj }) => obj.id)
  employee_id: number;

  @Exclude() 
  user: any; 

  @Expose()
  @ApiProperty()
  @Transform(({ obj }) => obj.user?.username)
  username: string;

  @Expose()
  @ApiProperty()
  @Transform(({ obj }) => obj.user?.email)
  email: string;

  @Expose()
  @ApiProperty()
  status: number;

  @Expose()
  @ApiProperty()
  refreshToken: string;

  @Expose()
  @ApiProperty()
  @Transform(({ obj }) => obj.user?.roleAssignments?.[0]?.role?.code ?? null)
  role: string;


  @Expose({ name: 'branch' })
  @ApiProperty()
  branch: Branch;

  @Expose({ name: 'customer' })
  @ApiProperty()
  @Transform(({ obj }) => obj.user?.customer ?? null)

  customer: Customer;

  @Expose()
  @ApiProperty()

  @Transform(({ obj }) => obj.user?.roleAssignments?.[0]?.role?.description ?? null)

  roleDescription: string;

  @Expose({ name: 'created_at' })
  @ApiProperty()
  create_at: Date;

  /*@Exclude()
  roleAssignments: any; */

  @Exclude()
  password: string; 

  @Expose({ name: 'updated_at' })
  @ApiProperty()
  update_at: Date;
}