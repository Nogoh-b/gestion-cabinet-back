import { UserRole } from '../../enums/user-role.enum';
import { Permission } from '../../enums/permission.enum';

export interface UserPayload {
  id: string;
  email: string;
  role: UserRole;
  permissions: Permission[];
  firstName: string;
  lastName: string;
}