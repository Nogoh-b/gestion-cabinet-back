import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

/**
 * Les QueryBuilder ne passent pas par le filtre cabinet automatique (il ne
 * couvre que find*). Mesuré par le banc : « État des impayés » et « Dossiers
 * comparables » listaient les factures et dossiers des autres cabinets.
 * Chaque createQueryBuilder d'une compétence doit être accompagné de
 * addTenantCondition (après son .where()).
 */
describe('compétences IA : filtre cabinet sur chaque QueryBuilder', () => {
  const dir = __dirname;
  const files = readdirSync(dir).filter((name) => name.endsWith('.ts') && !name.endsWith('.spec.ts'));

  it.each(files)('%s', (name) => {
    const source = readFileSync(join(dir, name), 'utf8');
    const builders = (source.match(/\.createQueryBuilder\(/g) ?? []).length;
    const scoped = (source.match(/addTenantCondition\(/g) ?? []).length;
    expect({ file: name, scoped }).toEqual({ file: name, scoped: builders });
  });
});
