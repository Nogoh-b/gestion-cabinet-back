import 'reflect-metadata';
import { DataSource } from 'typeorm';
import { ReferenceRegistry } from '../src/modules/reference-data/reference-registry';
import { ReferenceBootstrap } from '../src/modules/reference-data/reference-bootstrap';
import {
  fingerprint,
  orderItems,
} from '../src/modules/reference-data/reference-data.types';

async function main() {
  const db = new DataSource({
    type: 'mariadb',
    database: 'reference_metadata_only',
    entities: [process.cwd() + '/src/**/*.entity.ts'],
  });
  await (db as any).buildMetadatas();
  const registry = new ReferenceRegistry(db),
    bootstrap = new ReferenceBootstrap(registry);
  const originalLog = console.log;
  console.log = () => {};
  const items = await bootstrap.capture();
  const again = await bootstrap.capture();
  console.log = originalLog;
  const errors = registry.validate(
    items,
    new Set(items.filter((i) => i.kind === 'permissions').map((i) => i.key)),
  );
  originalLog(
    'ITEMS',
    items.length,
    'ORDERED',
    orderItems(items).length,
    'DETERMINISTIC',
    fingerprint(items) === fingerprint(again),
  );
  originalLog(
    'COUNTS',
    Object.fromEntries(
      registry
        .schema()
        .map((s) => [s.kind, items.filter((i) => i.kind === s.kind).length]),
    ),
  );
  originalLog('ERRORS', errors);
  if (errors.length || fingerprint(items) !== fingerprint(again))
    process.exitCode = 1;
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
