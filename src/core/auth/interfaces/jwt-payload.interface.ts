export interface JwtPayload {
  sub: number;
  username: string;
  // em: string;
  role?: string;
  iat?: number;
  exp?: number;
}