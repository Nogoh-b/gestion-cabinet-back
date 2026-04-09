import { config } from 'dotenv';
import { join } from 'path';
import { DataSource } from 'typeorm';



// Charger les variables d'environnement
config();

// Configuration TypeORM pour le Cameroun
export const dataSource = new DataSource({
  type: 'mysql',
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '3306'),
  username: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'cabinet_avocats_cameroun',
  entities: [
    join(__dirname, 'modules', '**', '*.entity.{ts,js}'),
    join(__dirname, '**', '*.entity.{ts,js}')
  ],
  migrations: [join(__dirname, 'migrations', '*.{ts,js}')],
  migrationsTableName: 'migrations',
  synchronize: process.env.NODE_ENV === 'development',
  logging: true,
  // Options spécifiques MySQL pour le Cameroun
  extra: {
    charset: 'utf8mb4',
    timezone: '+01:00' // Heure du Cameroun (WAT)
  }
});

// Vérifier la connexion
export async function testConnection() {
  try {
    await dataSource.initialize();
    console.log('✅ Connexion à la base de données établie avec succès');
    console.log(`📊 Base de données: ${dataSource.options.database}`);
    // console.log(`🏠 Hôte: ${dataSource.options.host}`);
    return true;
  } catch (error) {
    console.error('❌ Erreur de connexion à la base de données:', error);
    return false;
  }
}

export default dataSource;