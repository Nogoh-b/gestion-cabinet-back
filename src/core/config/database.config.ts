/* eslint-disable prettier/prettier */
// src/core/config/database.config.ts
import { SavingsAccountSubscriber } from 'src/modules/savings-account/savings-account/savings-account.subscriber';
import { TypeOrmModuleOptions } from '@nestjs/typeorm';




export const databaseConfig = (): { database: TypeOrmModuleOptions } => ({
  database: {
    type: 'mysql',
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '3306', 10),
    username: process.env.DB_USER ?? 'mendo',
    password: process.env.DB_PASSWORD ?? 'mendo',
    database: process.env.DB_NAME ??  'core_banking',  
    synchronize: true,  
    subscribers: [SavingsAccountSubscriber],  
    autoLoadEntities: true, 
    logging: ["error",],
    // logging: ["query", "error", "schema"], 
    logger: "advanced-console" 

  },
});
