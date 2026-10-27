/**
 * Diagnostic d'echec de connexion 401 (MOT DE PASSE / EMAIL).
 *
 * Usage : node scripts/diag-login-password.js <email> <mot-de-passe-candidat>
 *
 * N'affiche JAMAIS le hash ni le mot de passe : uniquement des metadonnees
 * non sensibles (ids, statuts, longueur/format du hash) et un booleen MATCH.
 * Lit la connexion DB depuis .env (DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME).
 */
const fs = require('fs');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');

function loadEnv(path) {
  const env = {};
  try {
    for (const line of fs.readFileSync(path, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (m) env[m[1]] = m[2];
    }
  } catch {
    // .env absent : on retombe sur les valeurs par defaut locales
  }
  return env;
}

async function main() {
  const [email, candidate] = process.argv.slice(2);
  if (!email || !candidate) {
    console.log('Usage : node scripts/diag-login-password.js <email> <mot-de-passe-candidat>');
    process.exit(2);
  }

  const env = loadEnv(require('path').join(__dirname, '..', '.env'));
  const conn = await mysql.createConnection({
    host: env.DB_HOST || 'localhost',
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER || 'root',
    password: env.DB_PASSWORD || '',
    database: env.DB_NAME || 'kabysoft',
  });

  try {
    const [rows] = await conn.query(
      'SELECT id, email, username, status, tenant_id, LENGTH(password) AS plen, LEFT(password, 4) AS algo FROM `user` WHERE email = ?',
      [email],
    );
    console.log('lignes user avec cet email :', rows.length);
    if (rows.length === 0) {
      console.log('=> email introuvable dans cette base (erreur EMAIL attendue, pas MOT DE PASSE).');
      return;
    }
    for (const r of rows) {
      console.log(
        `id=${r.id} username=${r.username} status=${r.status} tenant_id=${r.tenant_id} hash_len=${r.plen} hash_algo=${r.algo}`,
      );
      if (r.plen !== 60) {
        console.log(`   !! hash tronque ou au mauvais format (attendu : 60 caracteres bcrypt).`);
      }
    }
    if (rows.length > 1) {
      console.log('!! doublon : plusieurs comptes partagent cet email, le login peut matcher le mauvais.');
    }

    const [full] = await conn.query('SELECT id, password FROM `user` WHERE email = ?', [email]);
    for (const r of full) {
      let match = false;
      try {
        match = await bcrypt.compare(candidate, r.password);
      } catch (e) {
        console.log(`id=${r.id} COMPARE_ERROR=${e.message} (hash illisible : mot de passe a reinitialiser)`);
        continue;
      }
      console.log(`id=${r.id} MATCH=${match}`);
    }

    const ids = full.map((r) => r.id);
    const [emps] = await conn.query(
      `SELECT id, tenant_id, status FROM employee WHERE id IN (${ids.map(() => '?').join(',')})`,
      ids,
    );
    console.log('lignes employee liees :', emps.length);
    for (const e of emps) {
      console.log(`employee id=${e.id} tenant_id=${e.tenant_id} status=${e.status}`);
    }
    const [cabs] = await conn.query('SELECT id, code, status FROM cabinets');
    console.log('cabinets :', JSON.stringify(cabs.map((c) => ({ id: c.id, code: c.code, status: c.status }))));
  } finally {
    await conn.end();
  }
}

main().catch((e) => {
  console.log('DIAG_ERROR code=[' + e.code + '] message=[' + e.message + ']');
  process.exit(1);
});
