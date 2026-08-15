import { getJwtSecret } from 'src/core/config/secrets';

export const jwtConstants = {
  secret: getJwtSecret(),
  expiresIn: process.env.JWT_EXPIRES_IN || '1h'
};