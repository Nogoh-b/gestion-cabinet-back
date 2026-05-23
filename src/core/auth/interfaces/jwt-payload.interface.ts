export interface JwtPayload {
  sub: number;
  username: string;
  role?: string;
  permissions?: string[];
  customerId?: number | null;
  iat?: number;
  exp?: number;
}