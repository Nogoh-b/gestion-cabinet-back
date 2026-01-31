import 'reflect-metadata';
import dataSource from 'src/data-source';
// import dataSource from 'src/core/database/dataSource';
import { seedDatabase } from 'src/main.seeder';




async function run() {
  console.log('🌱 Initialisation des données par défaut...');
  console.log('📍 Contexte: Cabinet d\'avocats au Cameroun');
  
  // Initialiser la connexion à la base de données
  await dataSource.initialize();
  
  try {
    // Exécuter les seeders
    await seedDatabase(dataSource);
  } catch (error) {
    console.error('💥 Échec de l\'exécution des seeders:', error);
    process.exit(1);
  } finally {
    // Fermer la connexion
    await dataSource.destroy();
  }
  
  console.log('🎉 Processus de seeding terminé!');
  process.exit(0);
}

// Exécuter le script
run();