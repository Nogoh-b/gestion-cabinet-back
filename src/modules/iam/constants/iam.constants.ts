/**
 * Permissions système : jamais attribuables ni créables depuis l'API d'un
 * cabinet. Elles restent seedées pour compatibilité mais ne donnent plus de
 * pouvoir inter-cabinets (réservé à l'espace plateforme `/platform`).
 */
export const PROTECTED_PERMISSION_CODES = ['SUPER_ADMIN', 'AUDIT_SYSTEM'];

/**
 * Codes réservés à l'espace plateforme. Un admin de cabinet ne doit jamais
 * les obtenir via le bypass `role === 'admin'` du PermissionsGuard.
 */
export const PLATFORM_PERMISSION_CODES = [
  'manage_cabinets',
  'view_plans',
  'create_plan',
  'edit_plan',
  'delete_plan',
];

export function isProtectedPermission(permission: {
  code?: string | null;
  canChange?: number | null;
}): boolean {
  // canChange est nullable (défaut 1) : seul un 0 explicite verrouille.
  const locked =
    permission?.canChange !== null &&
    permission?.canChange !== undefined &&
    Number(permission.canChange) === 0;
  return (
    locked ||
    PROTECTED_PERMISSION_CODES.includes(String(permission?.code ?? ''))
  );
}
