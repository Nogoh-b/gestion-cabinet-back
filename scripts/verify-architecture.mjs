import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const failures = [];

function fail(message) {
  failures.push(message);
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
}

const migrationDirectory = join(root, 'src', 'migrations');
const migrationFiles = (await readdir(migrationDirectory))
  .filter((file) => file.endsWith('.ts'))
  .sort();
const timestamps = new Set();

for (const file of migrationFiles) {
  const match = file.match(/^(\d{13})-[A-Za-z0-9]+\.ts$/);
  if (!match) {
    fail(`Nom de migration invalide : ${file}`);
    continue;
  }
  if (timestamps.has(match[1])) {
    fail(`Timestamp de migration dupliqué : ${match[1]}`);
  }
  timestamps.add(match[1]);
  const source = await readFile(join(migrationDirectory, file), 'utf8');
  const explicitName = source.match(
    /\bname\s*=\s*['"]([^'"]+)['"]/,
  )?.[1];
  const className = source.match(
    /\bexport\s+class\s+([A-Za-z_$][\w$]*)/,
  )?.[1];
  const typeormName = explicitName ?? className;
  if (!typeormName || !typeormName.endsWith(match[1])) {
    fail(
      `Nom TypeORM invalide : ${file} (${typeormName ?? 'classe absente'})`,
    );
  }
  for (const marker of [
    /implements\s+MigrationInterface/,
    /async\s+up\s*\(/,
    /async\s+down\s*\(/,
  ]) {
    if (!marker.test(source)) fail(`Migration incomplète : ${file}`);
  }
}

const baselinePath = join(
  root,
  'database',
  'baseline',
  'legacy-schema-2026-06-26.sql',
);
const baseline = await readFile(baselinePath, 'utf8');
const baselineHash = createHash('sha256').update(baseline).digest('hex');
const expectedHash =
  '92f7786974c9a531cdbd7b21c756413c084661566fdcec9485c0caf9632d9890';
if (baselineHash !== expectedHash) {
  fail(`Empreinte du schéma de référence modifiée : ${baselineHash}`);
}
if (/^\s*INSERT\s+INTO\b/im.test(baseline)) {
  fail('Le schéma de référence contient des données');
}
const createTableCount = (baseline.match(/^CREATE TABLE\b/gim) ?? []).length;
if (createTableCount !== 71) {
  fail(`Le schéma de référence doit contenir 71 tables (${createTableCount})`);
}

const migrationPathFragment = join('src', 'migrations');
const sourceFiles = (await walk(join(root, 'src'))).filter(
  (file) =>
    file.endsWith('.ts') &&
    !file.includes(migrationPathFragment) &&
    !file.endsWith('.spec.ts'),
);
for (const file of sourceFiles) {
  const source = await readFile(file, 'utf8');
  const executableSource = source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const label = relative(root, file);
  if (/synchronize\s*:\s*true/.test(executableSource)) {
    fail(`synchronize:true interdit dans ${label}`);
  }
  if (/migrationsRun\s*:\s*true/.test(executableSource)) {
    fail(`migrationsRun:true interdit dans ${label}`);
  }
  if (/logging\s*:\s*true/.test(executableSource)) {
    fail(`logging:true interdit dans ${label}`);
  }
  if (/\bALTER\s+TABLE\b/i.test(executableSource)) {
    fail(`DDL d'exécution interdit hors migration dans ${label}`);
  }
}

const dossierEnum = await readFile(
  join(root, 'src', 'core', 'enums', 'dossier-status.enum.ts'),
  'utf8',
);
for (const status of ['DRAFT', 'ACTIVE', 'CLOSED', 'ARCHIVED']) {
  if (!new RegExp(`\\b${status}\\s*=\\s*['"]${status}['"]`).test(dossierEnum)) {
    fail(`Statut administratif manquant : ${status}`);
  }
}
for (const phase of [
  'ANALYSIS',
  'AMICABLE',
  'FIRST_INSTANCE',
  'APPEAL',
  'CASSATION',
  'ENFORCEMENT',
  'COMPLETED',
]) {
  if (new RegExp(`\\b${phase}\\s*=`).test(dossierEnum)) {
    fail(`Phase procédurale interdite dans le dossier : ${phase}`);
  }
}

const dossierContractFiles = [
  'src/modules/dossiers/entities/dossier.entity.ts',
  'src/modules/dossiers/dto/create-dossier.dto.ts',
  'src/modules/dossiers/dto/update-dossier.dto.ts',
  'src/modules/dossiers/dto/dossier-response.dto.ts',
  'src/modules/dossiers/dossiers.controller.ts',
];
for (const path of dossierContractFiles) {
  const source = await readFile(join(root, path), 'utf8');
  if (/\b(procedural_?phase|procedure_?status)\b/i.test(source)) {
    fail(`Projection procédurale persistée interdite dans ${path}`);
  }
  if (
    /@(Post|Patch)\s*\(\s*['"][^'"]*(analysis|appeal|cassation|execute)[^'"]*['"]/i.test(
      source,
    )
  ) {
    fail(`Ancienne commande procédurale exposée dans ${path}`);
  }
}

const packageJson = JSON.parse(
  await readFile(join(root, 'package.json'), 'utf8'),
);
for (const script of [
  'migration:bootstrap',
  'migration:run',
  'migration:verify',
  'migration:verify-data',
]) {
  if (!packageJson.scripts?.[script]) {
    fail(`Script de certification manquant : ${script}`);
  }
}

const typeormScript = packageJson.scripts?.typeorm ?? '';
for (const preload of ['ts-node/register', 'tsconfig-paths/register']) {
  if (!typeormScript.includes(preload)) {
    fail(`Le script TypeORM doit précharger ${preload}`);
  }
}

const ciWorkflow = await readFile(
  join(root, '.github', 'workflows', 'ci.yml'),
  'utf8',
);
for (const command of [
  'npm run migration:bootstrap',
  'npm run migration:run',
  'npm run migration:verify',
  'npm run migration:verify-data',
]) {
  if (!ciWorkflow.includes(command)) {
    fail(`Porte CI de migration manquante : ${command}`);
  }
}

const dataVerifier = await readFile(
  join(root, 'scripts', 'verify-migrated-data.mjs'),
  'utf8',
);
if (
  /\b(?:INSERT|UPDATE|DELETE|ALTER|DROP|CREATE|REPLACE)\b/i.test(
    dataVerifier
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, ''),
  )
) {
  fail('Le certificateur de données doit rester strictement en lecture seule');
}

if (failures.length) {
  console.error('Contrôle d’architecture en échec :');
  for (const message of failures) console.error(`- ${message}`);
  process.exitCode = 1;
} else {
  console.log(
    `Architecture validée : ${migrationFiles.length} migrations, schéma expurgé, dossier administratif uniquement.`,
  );
}
