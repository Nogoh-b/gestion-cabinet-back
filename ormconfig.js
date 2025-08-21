const { config } = require('dotenv');
config();

module.exports = {
  type: 'mysql',
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  username: process.env.DB_USERNAME,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  entities: ['src/core/database/entities/*.ts'],
  migrations: ['src/core/database/migrations/*.ts'],
  cli: {
    migrationsDir: 'src/core/database/migrations', 
  },
};