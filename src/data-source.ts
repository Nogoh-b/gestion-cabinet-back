import { DataSource } from 'typeorm';



// ... importe toutes tes entités

export const AppDataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306', 10),
  username: process.env.DB_USER ?? 'mendo',
  password: process.env.DB_PASSWORD ?? 'mendo',
  database: process.env.DB_NAME ??  'core_banking', 
  entities: ['src/**/*.entity.ts'],
  migrations: ['src/migrations/*.ts'],
  synchronize: false,
});
