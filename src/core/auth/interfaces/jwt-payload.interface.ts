export interface JwtPayload {
  sub: number;
  username: string;
  role?: string;
  permissions?: string[];
  customerId?: number | null;
  tenantId: number;
  iat?: number;
  exp?: number;
}
