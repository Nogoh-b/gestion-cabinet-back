/* Temporary read-only probe: verifies the mysql2 row shape for DATABASE() and
   reports the configured database name. Deleted after use. */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const mysql = require('mysql2/promise');

(async () => {
  const cfg = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'core',
  };
  console.log('configured DB_NAME:', JSON.stringify(process.env.DB_NAME));
  let conn;
  try {
    conn = await mysql.createConnection(cfg);
    const [rows] = await conn.query(
      'SELECT DATABASE() AS db, @@version AS version, @@collation_database AS coll',
    );
    console.log('row:', JSON.stringify(rows[0]));
    const [alt] = await conn.query(
      "SELECT DEFAULT_CHARACTER_SET_NAME, DEFAULT_COLLATION_NAME FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = DATABASE() LIMIT 1",
    );
    console.log('schemata row:', JSON.stringify(alt[0]));
  } catch (error) {
    console.log('probe failed:', error.code || '', error.message);
  } finally {
    if (conn) await conn.end();
  }
})();
