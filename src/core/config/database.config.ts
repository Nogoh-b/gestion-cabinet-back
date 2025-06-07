/* eslint-disable prettier/prettier */
// src/core/config/database.config.ts
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const databaseConfig = (): { database: TypeOrmModuleOptions } => ({
  database: {
    type: 'mysql',
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306', 10),
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME, 
    synchronize: true,
    autoLoadEntities: true,
    logging: ['error', 'warn', 'query'], // Active les logs

  },
});
