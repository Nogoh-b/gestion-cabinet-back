import { Exclude, Expose, Transform } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';
import { EmployeePosition, EmployeeStatus } from '../entities/employee.entity';
import { Branch } from 'src/modules/agencies/branch/entities/branch.entity';

export class EmployeeResponseDto {
  @Expose()
  @ApiProperty()
  @Transform(({ obj }) => obj.user?.id)
  id: number;

  @Expose()
  @ApiProperty()
  @Transform(({ obj }) => obj.id)
  employee_id: number;

  @Expose()
  @ApiProperty()
  @Transform(({ obj }) => obj.user?.first_name)
  first_name: string;

  @Expose()
  @ApiProperty()
  @Transform(({ obj }) => obj.user?.last_name)
  last_name: string;

  @Expose()
  @ApiProperty()
  @Transform(({ obj }) => `${obj.user?.first_name} ${obj.user?.last_name}`)
  full_name: string;

  @Expose()
  @ApiProperty()
  @Transform(({ obj }) => obj.user?.email)
  email: string;

  @Expose()
  @ApiProperty()
  @Transform(({ obj }) => obj.user?.phone_number)
  phone_number: string;

  @Expose()
  @ApiProperty({ enum: EmployeePosition })
  position: EmployeePosition;

  @Expose()
  @ApiProperty({ enum: EmployeeStatus })
  status: EmployeeStatus;

  @Expose()
  @ApiProperty()
  @Transform(({ obj }) => obj.user?.role)
  role: string;

  @Expose()
  @ApiProperty()
  hireDate: Date;

  @Expose()
  @ApiProperty()
  specialization?: string;

  @Expose()
  @ApiProperty()
  bar_association_number?: string;

  @Expose()
  @ApiProperty()
  bar_association_city?: string;

  @Expose()
  @ApiProperty()
  years_of_experience?: number;

  @Expose()
  @ApiProperty()
  hourly_rate?: number;

  @Expose()
  @ApiProperty()
  is_available: boolean;

  @Expose()
  @ApiProperty()
  max_dossiers: number;

  @Expose()
  @ApiProperty()
  current_dossier_count: number;

  @Expose()
  @ApiProperty()
  @Transform(({ obj }) => obj.expertise_areas || [])
  expertise_areas: string[];

  @Expose()
  @ApiProperty()
  @Transform(({ obj }) => obj.languages || [])
  languages: string[];

  @Expose()
  @ApiProperty()
  experience_level: string;

  @Expose()
  @ApiProperty()
  branch: Branch;

  @Expose()
  @ApiProperty()
  @Transform(({ obj }) => obj.created_at)
  created_at: Date;

  @Expose()
  @ApiProperty()
  @Transform(({ obj }) => obj.updated_at)
  updated_at: Date;

  @Exclude()
  user: any;

  @Exclude()
  password: string;

  // Getters calculés
  @Expose()
  get can_accept_more_dossiers(): boolean {
    return this.current_dossier_count < this.max_dossiers;
  }

  @Expose()
  get is_avocat(): boolean {
    return this.position === EmployeePosition.AVOCAT;
  }

  @Expose()
  get is_active(): boolean {
    return this.status === EmployeeStatus.ACTIVE;
  }
}