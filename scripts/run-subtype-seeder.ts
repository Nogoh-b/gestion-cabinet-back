/**
 * Script pour exécuter le seeder des sous-types de procédure
 * Utilise NestJS pour bootstrapper l'application et résoudre tous les modules
 * 
 * Usage: npx ts-node -r tsconfig-paths/register scripts/run-subtype-seeder.ts
 */

import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { getDataSourceToken } from '@nestjs/typeorm';
import ProcedureSubtypeSeeder from '../src/modules/procedures/seeder/procedure-subtype.seeder';

async function bootstrap() {
  console.log('🚀 Démarrage du seeder des sous-types de procédure...');
  
  // Créer l'application NestJS sans écouter sur un port
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    // Récupérer le DataSource TypeORM
    const dataSource = app.get<DataSource>(getDataSourceToken());
    
    // Exécuter le seeder
    const seeder = new ProcedureSubtypeSeeder();
    await seeder.run(dataSource, null as any);
    
    console.log('✅ Seeder des sous-types exécuté avec succès!');
  } catch (error) {
    console.error('❌ Erreur lors de l\'exécution du seeder:', error);
    throw error;
  } finally {
    await app.close();
  }
}

bootstrap().catch((error) => {
  console.error('❌ Erreur fatale:', error);
  process.exit(1);
});
