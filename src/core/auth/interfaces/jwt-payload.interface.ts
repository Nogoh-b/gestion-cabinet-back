export interface JwtPayload {
  sub: number;
  username: string;
  role?: string;
  permissions?: string[];
  iat?: number;
  exp?: number;
}