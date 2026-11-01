import 'reflect-metadata';
import 'dotenv/config';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const mod = require('./src/data-source');
const AppDataSource: any =
  mod.default ?? mod.AppDataSource ?? mod.dataSource;

(async () => {
  try {
    const ds = await AppDataSource.initialize();
    console.log(`OK: ${ds.entityMetadatas.length} entités`);
  } catch (error: any) {
    console.error('KO: ' + (error?.message ?? error));
    process.exitCode = 1;
  } finally {
    if (AppDataSource?.isInitialized) await AppDataSource.destroy();
  }
})();
