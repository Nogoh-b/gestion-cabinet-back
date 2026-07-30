import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

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

const bootstrapPath = join(root, 'scripts', 'bootstrap-empty-database.mjs');
const bootstrap = await readFile(bootstrapPath, 'utf8');
if (/\blegacyCutoff\b/.test(bootstrap)) {
  fail(
    'Le bootstrap ne doit pas rapprocher les migrations par seuil chronologique',
  );
}
const reconciledBlock = bootstrap.match(
  /const\s+baselineReconciledMigrationTimestamps\s*=\s*new Set\(\[([\s\S]*?)\]\);/,
);
if (!reconciledBlock) {
  fail(
    'Le bootstrap doit déclarer explicitement les migrations représentées par le baseline',
  );
} else {
  const configuredTimestamps = [
    ...reconciledBlock[1].matchAll(/\b[\d_]{13,}\b/g),
  ].map(([value]) => Number(value.replaceAll('_', '')));
  const expectedTimestamps = [
    1779107127070, 1779200000000, 1779300000000, 1779400000000,
    1779500000000, 1779600000000, 1781600000000, 1782000002000,
    1782000004000, 1782000005000, 1782100000000, 1782100001000,
    1782100002000, 1782200000000,
  ];
  if (
    configuredTimestamps.length !== expectedTimestamps.length ||
    configuredTimestamps.some(
      (timestamp, index) => timestamp !== expectedTimestamps[index],
    )
  ) {
    fail('La liste des migrations rapprochées du baseline est inattendue');
  }
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

for (const file of sourceFiles.filter((path) => path.endsWith('.entity.ts'))) {
  const source = await readFile(file, 'utf8');
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const visit = (node) => {
    if (
      ts.isPropertyDeclaration(node) &&
      node.type &&
      ts.isUnionTypeNode(node.type)
    ) {
      const includesNull = node.type.types.some(
        (typeNode) =>
          typeNode.kind === ts.SyntaxKind.NullKeyword ||
          (ts.isLiteralTypeNode(typeNode) &&
            typeNode.literal.kind === ts.SyntaxKind.NullKeyword),
      );

      if (includesNull) {
        for (const decorator of ts.getDecorators(node) ?? []) {
          const expression = decorator.expression;
          if (
            !ts.isCallExpression(expression) ||
            !ts.isIdentifier(expression.expression) ||
            expression.expression.text !== 'Column'
          ) {
            continue;
          }

          const options = expression.arguments.find((argument) =>
            ts.isObjectLiteralExpression(argument),
          );
          const hasExplicitType =
            options &&
            options.properties.some(
              (property) =>
                property.name &&
                (property.name.text ?? property.name.escapedText) === 'type',
            );

          if (!hasExplicitType) {
            const position = sourceFile.getLineAndCharacterOfPosition(
              node.getStart(sourceFile),
            );
            fail(
              `Type SQL explicite requis pour l'union nullable ${relative(
                root,
                file,
              )}:${position.line + 1}`,
            );
          }
        }
      }
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
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
  'migration:rehearse',
  'migration:run',
  'migration:verify',
  'migration:verify-data',
]) {
  if (!packageJson.scripts?.[script]) {
    fail(`Script de certification manquant : ${script}`);
  }
}

const rehearsalScript = await readFile(
  join(root, 'scripts', 'migration-rehearsal.ts'),
  'utf8',
);
const rehearsalSafety = await readFile(
  join(
    root,
    'src',
    'core',
    'config',
    'migration-rehearsal-safety.ts',
  ),
  'utf8',
);
const rehearsalSources = `${rehearsalScript}\n${rehearsalSafety}`;
for (const marker of [
  'ANONYMIZED_COPY_ONLY',
  '--execute',
  'historicalReconciliationReady',
  'migration:verify-data',
  'artifacts-private',
]) {
  if (!rehearsalSources.includes(marker)) {
    fail(`Garde-fou de répétition manquant : ${marker}`);
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
for (const marker of [
  'image: mysql:${{ matrix.mysql_version }}',
  "'8.0'",
  "'8.4'",
]) {
  if (!ciWorkflow.includes(marker)) {
    fail(`Certification CI MySQL manquante : ${marker}`);
  }
}
if (/\bmariadb\b/i.test(ciWorkflow)) {
  fail('La certification CI doit utiliser MySQL, moteur cible du projet');
}

const activeStageVisitMigration = await readFile(
  join(
    root,
    'src',
    'migrations',
    '1785169010000-EnforceSingleActiveStageVisit.ts',
  ),
  'utf8',
);
if (
  !activeStageVisitMigration.includes('GENERATED ALWAYS AS') ||
  !activeStageVisitMigration.includes(') VIRTUAL')
) {
  fail(
    'La contrainte de visite active doit utiliser une colonne calculée virtuelle compatible MySQL',
  );
}
if (/\)\s+STORED\b/i.test(activeStageVisitMigration)) {
  fail(
    'Une colonne calculée STORED ne peut pas dépendre de la clé étrangère instanceId en cascade sous MySQL',
  );
}

const liveSchemaVerifier = await readFile(
  join(root, 'scripts', 'verify-live-schema.mjs'),
  'utf8',
);
for (const alias of [
  'TABLE_NAME AS table_name',
  'COLUMN_NAME AS column_name',
  'COLUMN_TYPE AS column_type',
  'TRIGGER_NAME AS trigger_name',
]) {
  if (!liveSchemaVerifier.includes(alias)) {
    fail(
      `Alias information_schema compatible MySQL manquant : ${alias}`,
    );
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
