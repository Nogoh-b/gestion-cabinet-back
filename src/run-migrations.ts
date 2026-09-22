// Exécute les migrations TypeORM en attente puis se termine.
// Point d'entrée prod (image sans ts-node) : `node dist/src/run-migrations.js`.
// Quitte avec un code non nul en cas d'échec pour empêcher le démarrage
// du serveur sur un schéma obsolète (fail-fast au boot du conteneur).
import { dataSource } from './data-source';

async function main(): Promise<void> {
  await dataSource.initialize();
  try {
    const executed = await dataSource.runMigrations();
    console.log(`Migrations appliquees : ${executed.length}`);
    for (const migration of executed) {
      console.log(` - ${migration.name}`);
    }
  } finally {
    await dataSource.destroy();
  }
}

main().catch((error) => {
  console.error('Echec des migrations :', error);
  process.exitCode = 1;
});
