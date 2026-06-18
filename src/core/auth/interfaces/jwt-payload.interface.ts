export interface JwtPayload {
  sub: number;
  username: string;
  role?: string;
  permissions?: string[];
  customerId?: number | null;
  tenantId?: number;        // ← cabinet auquel appartient l'utilisateur
  iat?: number;
  exp?: number;
}
