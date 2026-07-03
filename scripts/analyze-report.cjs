// scripts/analyze-report.cjs — Analyse le rapport JSON de l'audit multi-tenant.
// Usage: node scripts/analyze-report.cjs
const fs = require('fs');
const path = require('path');

const report = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'audit-tenant-report.json'), 'utf8'),
);

const normalize = (p) => p.replace(/\\/g, '/');

// Regroupement par module (2 premiers segments du chemin).
const byModule = {};
const byFile = {};
for (const h of report.unprotected) {
  const parts = normalize(h.file).split('/');
  const mod = parts.length > 1 ? parts.slice(0, 2).join('/') : parts[0];
  byModule[mod] = (byModule[mod] || 0) + 1;
  byFile[normalize(h.file)] = (byFile[normalize(h.file)] || 0) + 1;
}

console.log('TOTAL non protégées:', report.unprotectedCount, '/', report.total);
console.log('\n─ Par module (décroissant) ─');
for (const [m, c] of Object.entries(byModule).sort((a, b) => b[1] - a[1])) {
  console.log('  ' + String(c).padStart(3) + '  ' + m);
}

console.log('\n─ Top 20 fichiers les plus exposés ─');
const files = Object.entries(byFile).sort((a, b) => b[1] - a[1]).slice(0, 20);
for (const [f, c] of files) console.log('  ' + String(c).padStart(3) + '  ' + f);

// ── Filtre par pattern de fichier (argument CLI) ───────────────────────
// Usage: node scripts/analyze-report.cjs facture
const filter = process.argv[2];
if (filter) {
  console.log('\n─ Détail pour "' + filter + '" ─');
  for (const h of report.unprotected) {
    const norm = normalize(h.file);
    if (norm.includes(filter)) {
      console.log('  ' + norm + ':' + h.line + '  ' + h.text.slice(0, 70));
    }
  }
}
