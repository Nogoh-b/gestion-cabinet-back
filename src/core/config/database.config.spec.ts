import { databaseConfig } from './database.config';

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
});
