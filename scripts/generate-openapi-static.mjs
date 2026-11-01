import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const sourceRoot = join(root, 'src');
const outputPath = join(root, 'openapi', 'openapi.json');
const checkOnly = process.argv.includes('--check');
const httpDecorators = new Map([
  ['Get', 'get'],
  ['Post', 'post'],
  ['Put', 'put'],
  ['Patch', 'patch'],
  ['Delete', 'delete'],
]);

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

function decorators(node) {
  return ts.canHaveDecorators(node) ? ts.getDecorators(node) ?? [] : [];
}

function decoratorCall(node) {
  return ts.isCallExpression(node.expression) ? node.expression : null;
}

function decoratorName(call) {
  if (!call) return null;
  if (ts.isIdentifier(call.expression)) return call.expression.text;
  if (ts.isPropertyAccessExpression(call.expression)) {
    return call.expression.name.text;
  }
  return null;
}

function literalArgument(call) {
  const argument = call?.arguments[0];
  if (!argument) return '';
  if (
    ts.isStringLiteral(argument) ||
    ts.isNoSubstitutionTemplateLiteral(argument)
  ) {
    return argument.text;
  }
  throw new Error(
    `Route non statique interdite dans le contrat : ${argument.getText()}`,
  );
}

function normalizePath(...parts) {
  const joined = parts
    .filter(Boolean)
    .join('/')
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/:([A-Za-z0-9_]+)/g, '{$1}');
  return `/${joined}`.replace(/\/$/, '') || '/';
}

function methodName(member) {
  if (ts.isIdentifier(member.name)) return member.name.text;
  if (ts.isStringLiteral(member.name)) return member.name.text;
  return 'anonymous';
}

const controllerFiles = (await walk(sourceRoot))
  .filter((file) => file.endsWith('.controller.ts'))
  .sort();
const paths = {};
const operationIds = new Set();

for (const file of controllerFiles) {
  const source = await readFile(file, 'utf8');
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  for (const statement of sourceFile.statements) {
    if (!ts.isClassDeclaration(statement) || !statement.name) continue;
    const controllerDecorator = decorators(statement)
      .map(decoratorCall)
      .find((call) => decoratorName(call) === 'Controller');
    if (!controllerDecorator) continue;
    const controllerPath = literalArgument(controllerDecorator);
    const className = statement.name.text.replace(/Controller$/, '');
    const classIsPublic = decorators(statement)
      .map(decoratorCall)
      .some((call) => decoratorName(call) === 'Public');

    for (const member of statement.members) {
      if (!ts.isMethodDeclaration(member) || !member.name) continue;
      const calls = decorators(member).map(decoratorCall);
      const httpCall = calls.find((call) =>
        httpDecorators.has(decoratorName(call)),
      );
      if (!httpCall) continue;
      const httpMethod = httpDecorators.get(decoratorName(httpCall));
      const routePath = normalizePath(
        controllerPath,
        literalArgument(httpCall),
      );
      paths[routePath] ??= {};
      if (paths[routePath][httpMethod]) {
        throw new Error(
          `Route dupliquée : ${httpMethod.toUpperCase()} ${routePath}`,
        );
      }

      const operationId = `${className}_${methodName(member)}`;
      if (operationIds.has(operationId)) {
        throw new Error(`operationId dupliqué : ${operationId}`);
      }
      operationIds.add(operationId);
      const isPublic =
        classIsPublic ||
        calls.some((call) => decoratorName(call) === 'Public');
      const parameters = [...routePath.matchAll(/\{([^}]+)\}/g)].map(
        ([, name]) => ({
          name,
          in: 'path',
          required: true,
          schema: { type: 'string' },
        }),
      );

      paths[routePath][httpMethod] = {
        operationId,
        tags: [controllerPath.split('/')[0] || 'system'],
        ...(parameters.length ? { parameters } : {}),
        ...(!isPublic
          ? {
              security: [
                {
                  sessionCookie: [],
                  tenantHeader: [],
                },
              ],
            }
          : {}),
        responses: {
          200: { description: 'Succès' },
          400: { description: 'Requête invalide' },
          401: { description: 'Non authentifié' },
          403: { description: 'Accès refusé' },
        },
        'x-source': relative(root, file).replace(/\\/g, '/'),
      };
    }
  }
}

const sortedPaths = Object.fromEntries(
  Object.entries(paths)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([path, methods]) => [
      path,
      Object.fromEntries(
        Object.entries(methods).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ),
    ]),
);
const document = {
  openapi: '3.1.0',
  info: {
    title: 'KabySoft Cabinet API',
    version: '3.0.0',
    description:
      'Contrat de routes généré statiquement. Les schémas DTO restent enrichis par Swagger au runtime.',
  },
  servers: [{ url: '/' }],
  components: {
    securitySchemes: {
      sessionCookie: {
        type: 'apiKey',
        in: 'cookie',
        name: 'access_token',
      },
      tenantHeader: {
        type: 'apiKey',
        in: 'header',
        name: 'x-tenant-code',
      },
    },
  },
  paths: sortedPaths,
};
const serialized = `${JSON.stringify(document, null, 2)}\n`;

if (checkOnly) {
  const committed = await readFile(outputPath, 'utf8');
  if (committed !== serialized) {
    console.error(
      'Le contrat OpenAPI a dérivé. Exécutez npm run openapi:generate.',
    );
    process.exitCode = 1;
  } else {
    console.log(
      `Contrat OpenAPI stable : ${Object.keys(sortedPaths).length} chemins, ${operationIds.size} opérations.`,
    );
  }
} else {
  await writeFile(outputPath, serialized, 'utf8');
  console.log(
    `Contrat OpenAPI généré : ${Object.keys(sortedPaths).length} chemins, ${operationIds.size} opérations.`,
  );
}
