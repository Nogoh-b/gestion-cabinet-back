// app.config.ts
import { registerAs } from '@nestjs/config';

export default registerAs('app', () => ({
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORTT ?? '3000', 10) || 3000,
  jwtSecret: process.env.JWT_SECRET,
}));