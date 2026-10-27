import { PartialType } from '@nestjs/swagger';
import { CreateEmployeeLeaveDto } from './create-employee-leave.dto';

export class UpdateEmployeeLeaveDto extends PartialType(
  CreateEmployeeLeaveDto,
) {}
