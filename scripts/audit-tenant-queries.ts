/**
 * audit-tenant-queries.ts — Audit statique de l'isolation multi-tenant.
 *
 * Détecte les requêtes TypeORM (createQueryBuilder / .query()) qui n'appellent
 * PAS le helper addTenantCondition(), et qui pourraient donc contourner le
 * filtrage automatique par tenant_id.
 *
 * Utilisation :
 *   npx ts-node -r tsconfig-paths/register scripts/audit-tenant-queries.ts
 *
 * Le script ne modifie RIEN — il produit un rapport à examiner manuellement.
 * C'est normal : certaines requêtes sont légitimement cross-tenant (admin,
 * entités globales, agrégats de stats super-admin...).
 */
import * as fs from 'fs';
import * as path from 'path';

const SRC_ROOT = path.resolve(__dirname, '..', 'src');
const PATTERNS = [
  /\.createQueryBuilder\s*\(/,
  /\.(query|manager\.query)\s*\(/,
];

// Dossiers à ignorer (les requêtes y sont légitimement non filtrées).
const IGNORE_DIRS = [
  `${path.sep}migrations${path.sep}`,
  `${path.sep}core${path.sep}tenant${path.sep}`, // le patch lui-même
  `${path.sep}auth${path.sep}seeders${path.sep}`,
];

interface Hit {
  file: string;
  line: number;
  text: string;
  protectedByHelper: boolean;
}

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue;
      walk(full, out);
    } else if (entry.isFile() && (full.endsWith('.ts') || full.endsWith('.tsx'))) {
      out.push(full);
    }
  }
  return out;
}

function scan(): Hit[] {
  const hits: Hit[] = [];
  const files = walk(SRC_ROOT);

  for (const file of files) {
    if (IGNORE_DIRS.some((d) => file.includes(d))) continue;

    const lines = fs.readFileSync(file, 'utf8').split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!PATTERNS.some((p) => p.test(line))) continue;

      // Vérifie si addTenantCondition est appelé dans les 12 lignes suivantes
      // (une QueryBuilder est typiquement construite puis filtrée peu après).
      const window = lines.slice(i, i + 12).join('\n');
      const protectedByHelper = /addTenantCondition\s*\(/.test(window);

      hits.push({
        file: path.relative(SRC_ROOT, file),
        line: i + 1,
        text: line.trim(),
        protectedByHelper,
      });
    }
  }
  return hits;
}

const hits = scan();
const unprotected = hits.filter((h) => !h.protectedByHelper);
const protected_ = hits.filter((h) => h.protectedByHelper);

console.log('═'.repeat(78));
console.log(' AUDIT MULTI-TENANT — Requêtes TypeORM');
console.log('═'.repeat(78));
console.log(` Total requêtescreateQueryBuilder/query() détectées : ${hits.length}`);
console.log(` ✅ Protégées par addTenantCondition()        : ${protected_.length}`);
console.log(` ⚠️  NON protégées (à examiner)                : ${unprotected.length}`);
console.log('═'.repeat(78));

if (unprotected.length) {
  console.log('\nRequêtes non protégées (vérifier chaque cas) :\n');
  const byFile = new Map<string, Hit[]>();
  for (const h of unprotected) {
    if (!byFile.has(h.file)) byFile.set(h.file, []);
    byFile.get(h.file)!.push(h);
  }
  for (const [file, fileHits] of byFile) {
    console.log(`\n  📄 ${file}`);
    for (const h of fileHits) {
      console.log(`     L${h.line}: ${h.text.slice(0, 90)}`);
    }
  }
  console.log(
    '\nRappel : chaque requête non protégée doit soit :' +
      '\n  - appeler addTenantCondition(qb, "alias") si elle cible une entité tenantée,' +
      '\n  - OU être explicitement légitime (entité globale, super-admin, stats agrégées).',
  );
} else {
  console.log('\n✅ Aucune requête non protégée détectée.');
}
