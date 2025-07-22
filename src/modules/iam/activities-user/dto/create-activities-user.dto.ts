// create-activities-user.dto.ts
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsInt } from 'class-validator';

export class CreateActivitiesUserDto {
  @ApiProperty()
  @IsString()
  typeActivities: string;

  @ApiProperty()
  @IsInt()
  userId: number;
}