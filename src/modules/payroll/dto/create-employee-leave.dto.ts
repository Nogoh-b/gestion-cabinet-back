import {
  IsDateString,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { EmployeeLeaveStatus } from '../entities/employee-leave.entity';

export class CreateEmployeeLeaveDto {
  @ApiPropertyOptional({
    example: 5,
    description:
      "Collaborateur concerné. Ignoré sur /request : la demande porte toujours sur l'utilisateur connecté.",
  })
  @IsInt()
  @IsOptional()
  employee_id?: number;

  @ApiProperty({
    example: '2026-07-01',
    description: 'Premier jour de la permission',
  })
  @IsDateString()
  @IsNotEmpty()
  start_date: string;

  @ApiProperty({
    example: '2026-07-10',
    description: 'Dernier jour de la permission (inclus)',
  })
  @IsDateString()
  @IsNotEmpty()
  end_date: string;

  @ApiProperty({ example: 'Congé annuel', description: 'Motif de la demande' })
  @IsString()
  @IsNotEmpty()
  reason: string;

  @ApiPropertyOptional({
    enum: EmployeeLeaveStatus,
    description:
      "Statut souhaité à la création. Réservé à l'administrateur ; une demande self-service est toujours 'pending'.",
  })
  @IsEnum(EmployeeLeaveStatus)
  @IsOptional()
  status?: EmployeeLeaveStatus;
}
