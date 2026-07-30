// src/core/config/database.config.ts
import { join } from 'path';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';

export const databaseConfig = (): { database: TypeOrmModuleOptions } => ({
  database: {
    type: 'mysql',
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306', 10),
    username: process.env.DB_USER ?? 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME ?? 'core',
    synchronize: false,
    migrationsRun: false,
    migrations: [join(__dirname, '../../migrations/*{.ts,.js}')],
    // subscribers: [join(__dirname, '../../**/*.subscriber{.ts,.js}')],
    // subscribers: [join(__dirname, '../../**/*.subscriber{.ts,.js}')],
    entities: [join(__dirname, '../../**/*.entity{.ts,.js}')],
    logging: ['error'],
    logger: 'advanced-console',
  },
});
