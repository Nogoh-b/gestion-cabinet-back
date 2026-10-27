import { UserRole } from '../enums/user-role.enum';

/** Business visibility category; administrative bypass always uses the actual role code. */
export function businessRole(
  user: { role?: string | null; base_role?: string | null } | null | undefined,
): UserRole {
  const role = user?.role;
  if (role === UserRole.ADMIN || role === UserRole.CLIENT) return role;
  const base = user?.base_role;
  if (
    base &&
    base !== UserRole.ADMIN &&
    base !== UserRole.CLIENT &&
    Object.values(UserRole).includes(base as UserRole)
  )
    return base as UserRole;
  return Object.values(UserRole).includes(role as UserRole)
    ? (role as UserRole)
    : UserRole.COLLABORATEUR;
}
