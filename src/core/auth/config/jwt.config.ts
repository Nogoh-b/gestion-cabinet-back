export const jwtConstants = {
  secret: process.env.JWT_SECRET || 'secretKey',
  expiresIn: process.env.JWT_EXPIRES_IN || '1h'
};