export const REHEARSAL_CONFIRMATION = 'ANONYMIZED_COPY_ONLY';

export interface MigrationRehearsalTarget {
  database: string;
  host: string;
  hostClass: 'local' | 'private' | 'remote';
  port: number;
  user: string;
}

type Environment = Record<string, string | undefined>;

const SAFE_DATABASE_MARKER =
  /(anon|anonym|rehearsal|recette|preprod|staging|test|qa)/i;
const PRODUCTION_DATABASE_MARKER = /(^|[_-])(prod|production|live)([_-]|$)/i;

export function classifyDatabaseHost(
  host: string,
): MigrationRehearsalTarget['hostClass'] {
  const normalized = host.trim().toLowerCase();
  if (['localhost', '127.0.0.1', '::1'].includes(normalized)) {
    return 'local';
  }
  if (
    /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(normalized) ||
    normalized.endsWith('.internal') ||
    normalized.endsWith('.local')
  ) {
    return 'private';
  }
  return 'remote';
}

export function assertMigrationRehearsalTarget(
  environment: Environment,
): MigrationRehearsalTarget {
  const failures: string[] = [];
  const database = environment.DB_NAME?.trim() ?? '';
  const host = environment.DB_HOST?.trim() ?? '';
  const user = environment.DB_USER?.trim() ?? '';
  const port = Number(environment.DB_PORT ?? 3306);

  if (environment.MIGRATION_REHEARSAL_CONFIRMATION !== REHEARSAL_CONFIRMATION) {
    failures.push(
      `MIGRATION_REHEARSAL_CONFIRMATION doit valoir ${REHEARSAL_CONFIRMATION}`,
    );
  }
  if ((environment.NODE_ENV ?? '').trim().toLowerCase() === 'production') {
    failures.push('NODE_ENV=production est interdit pour une répétition');
  }
  if (!database) {
    failures.push('DB_NAME est obligatoire');
  } else {
    if (PRODUCTION_DATABASE_MARKER.test(database)) {
      failures.push('DB_NAME ressemble à une base de production');
    }
    if (!SAFE_DATABASE_MARKER.test(database)) {
      failures.push(
        'DB_NAME doit contenir anon, rehearsal, recette, preprod, staging, test ou qa',
      );
    }
  }
  if (!host) failures.push('DB_HOST doit être défini explicitement');
  if (!user) failures.push('DB_USER est obligatoire');
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) {
    failures.push('DB_PORT est invalide');
  }

  const hostClass = host ? classifyDatabaseHost(host) : 'remote';
  if (
    hostClass === 'remote' &&
    environment.MIGRATION_REHEARSAL_ALLOW_REMOTE !== 'true'
  ) {
    failures.push(
      'Une cible distante exige MIGRATION_REHEARSAL_ALLOW_REMOTE=true',
    );
  }
  if (hostClass === 'remote' && !(environment.DB_PASSWORD ?? '').trim()) {
    failures.push('Une cible distante exige un mot de passe non vide');
  }

  if (failures.length > 0) {
    throw new Error(`Cible de répétition refusée:\n- ${failures.join('\n- ')}`);
  }
  return { database, host, hostClass, port, user };
}
