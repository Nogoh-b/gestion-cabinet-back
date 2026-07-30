import { databaseConfig } from './database.config';
import { DataSource } from 'typeorm';
import * as dataSourceModule from '../../data-source';

describe('databaseConfig', () => {
  const originalSynchronize = process.env.SYNCHRONIZE;

  afterEach(() => {
    if (originalSynchronize === undefined) {
      delete process.env.SYNCHRONIZE;
    } else {
      process.env.SYNCHRONIZE = originalSynchronize;
    }
  });

  it('interdit synchronize meme si la variable historique le demande', () => {
    process.env.SYNCHRONIZE = 'true';
    const options = databaseConfig().database as any;

    expect(options.synchronize).toBe(false);
    expect(options.migrationsRun).toBe(false);
    expect(options.migrations).toEqual(
      expect.arrayContaining([
        expect.stringContaining('migrations'),
      ]),
    );
  });

  it('ne journalise que les erreurs TypeORM', () => {
    const options = databaseConfig().database as any;
    expect(options.logging).toEqual(['error']);
  });

  it('expose une seule instance DataSource pour la CLI de migration', () => {
    const exportedDataSources = Object.values(dataSourceModule).filter(
      (value) => value instanceof DataSource,
    );

    expect(exportedDataSources).toEqual([dataSourceModule.default]);
  });
});
