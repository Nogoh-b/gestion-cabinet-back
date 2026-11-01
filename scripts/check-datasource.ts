import 'reflect-metadata';
import 'dotenv/config';
import AppDataSource from '../src/data-source';

(async () => {
  try {
    const dataSource = await AppDataSource.initialize();
    console.log(
      `OK: DataSource initialisée, ${dataSource.entityMetadatas.length} entités, ${dataSource.migrations.length} migrations`,
    );
  } catch (error: any) {
    console.error('KO: ' + (error?.message ?? error));
    process.exitCode = 1;
  } finally {
    if (AppDataSource.isInitialized) await AppDataSource.destroy();
  }
})();
