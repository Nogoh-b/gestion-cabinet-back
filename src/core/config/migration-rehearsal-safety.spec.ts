import {
  assertMigrationRehearsalTarget,
  classifyDatabaseHost,
  REHEARSAL_CONFIRMATION,
} from './migration-rehearsal-safety';

describe('migration rehearsal safety', () => {
  const safeEnvironment = {
    MIGRATION_REHEARSAL_CONFIRMATION: REHEARSAL_CONFIRMATION,
    NODE_ENV: 'test',
    DB_NAME: 'kabysoft_anonymized_rehearsal',
    DB_HOST: '127.0.0.1',
    DB_PORT: '3306',
    DB_USER: 'rehearsal',
    DB_PASSWORD: '',
  };

  it('autorise uniquement une cible locale explicitement anonymisée', () => {
    expect(assertMigrationRehearsalTarget(safeEnvironment)).toEqual({
      database: 'kabysoft_anonymized_rehearsal',
      host: '127.0.0.1',
      hostClass: 'local',
      port: 3306,
      user: 'rehearsal',
    });
  });

  it.each([
    [{ ...safeEnvironment, NODE_ENV: 'production' }, 'NODE_ENV=production'],
    [{ ...safeEnvironment, DB_NAME: 'kabysoft' }, 'DB_NAME doit contenir'],
    [{ ...safeEnvironment, DB_NAME: 'kabysoft_prod_test' }, 'production'],
    [
      {
        ...safeEnvironment,
        MIGRATION_REHEARSAL_CONFIRMATION: 'yes',
      },
      'MIGRATION_REHEARSAL_CONFIRMATION',
    ],
  ])('refuse une cible ambiguë ou dangereuse', (environment, message) => {
    expect(() => assertMigrationRehearsalTarget(environment)).toThrow(message);
  });

  it('exige deux confirmations supplémentaires pour une cible distante', () => {
    const remote = {
      ...safeEnvironment,
      DB_HOST: 'db-preprod.example.test',
    };
    expect(() => assertMigrationRehearsalTarget(remote)).toThrow(
      'MIGRATION_REHEARSAL_ALLOW_REMOTE=true',
    );
    expect(() =>
      assertMigrationRehearsalTarget({
        ...remote,
        MIGRATION_REHEARSAL_ALLOW_REMOTE: 'true',
      }),
    ).toThrow('mot de passe non vide');
    expect(
      assertMigrationRehearsalTarget({
        ...remote,
        MIGRATION_REHEARSAL_ALLOW_REMOTE: 'true',
        DB_PASSWORD: 'secret-for-test',
      }).hostClass,
    ).toBe('remote');
  });

  it('classe les réseaux sans exposer leur adresse dans un rapport', () => {
    expect(classifyDatabaseHost('localhost')).toBe('local');
    expect(classifyDatabaseHost('10.0.0.5')).toBe('private');
    expect(classifyDatabaseHost('db.internal')).toBe('private');
    expect(classifyDatabaseHost('database.example.test')).toBe('remote');
  });
});
