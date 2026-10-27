import { UserRole } from '../../enums/user-role.enum';
import { Permission } from '../../enums/permission.enum';

export interface UserPayload {
  id: string;
  email: string;
  role: string;
  base_role?: UserRole;
  role_name?: string;
  permissions: Permission[];
  firstName: string;
  lastName: string;
}
