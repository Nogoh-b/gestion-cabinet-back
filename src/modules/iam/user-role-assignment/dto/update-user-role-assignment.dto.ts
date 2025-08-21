import { PartialType } from '@nestjs/swagger';
import { CreateUserRoleAssignmentDto } from './create-user-role-assignment.dto';

export class UpdateUserRoleAssignmentDto extends PartialType(CreateUserRoleAssignmentDto) {}
