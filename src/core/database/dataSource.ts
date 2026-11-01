import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { join } from 'path';
dotenv.config({
  path: join(__dirname, './.env'),
});

function loadDatabase() {
  return {
    type: process.env.DB_TYPE || 'mysql',
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306', 10),
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'core',
    synchronize: false,
    logging: ['error'],
    entities: [join(__dirname, '../../**/*.entity{.ts,.js}')],
    migrations: [join(__dirname, '../../migrations/*{.ts,.js}')],
    migrationsRun: false,
  };
}
export default new DataSource(loadDatabase() as any);
