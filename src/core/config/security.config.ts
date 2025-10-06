import { registerAs } from '@nestjs/config';

export default registerAs('security', () => ({
  jwt: {
    secret: process.env.JWT_SECRET || 'defaultSecretKey',
    expiresIn: process.env.JWT_EXPIRES_IN || '1d',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },
  
  password: {
    minLength: parseInt(process.env.PASSWORD_MIN_LENGTH || '8', 10),
    saltRounds: parseInt(process.env.SALT_ROUNDS || '12', 10),
    requireSpecialChar: process.env.PASSWORD_SPECIAL_CHAR !== 'false',
    requireNumbers: process.env.PASSWORD_NUMBERS !== 'false',
  },
  
  mfa: {
    enabled: process.env.MFA_ENABLED === 'true',
    issuer: process.env.MFA_ISSUER || 'Juridique System',
  },
  
  rateLimit: {
    ttl: parseInt(process.env.RATE_LIMIT_TTL || '60', 10),
    limit: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  },
  
  cors: {
    enabled: process.env.CORS_ENABLED !== 'false',
    origins: process.env.CORS_ORIGINS?.split(',') || ['http://localhost:3000'],
  },
}));