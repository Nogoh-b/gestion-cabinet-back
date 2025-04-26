import { DataSource } from 'typeorm';
// ... importe toutes tes entités

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: 'localhost',
  port: 3306,
  username: 'mendo',
  password: 'mendo',
  database: 'core_banking', 
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
});
