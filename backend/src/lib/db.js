// Acceso a PostgreSQL con SQL directo (pg). Las filas se devuelven en camelCase.
const fs = require('fs');
const path = require('path');
const { Pool, types } = require('pg');

types.setTypeParser(1700, (v) => (v === null ? null : parseFloat(v))); // NUMERIC → número
types.setTypeParser(1082, (v) => v); // DATE → 'YYYY-MM-DD' sin desfase horario

const ssl = /sslmode=require/.test(process.env.DATABASE_URL || '') ? { rejectUnauthorized: false } : undefined;
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl, max: 10 });

const camel = (s) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
const mapRow = (r) => {
  const o = {};
  for (const k of Object.keys(r)) o[camel(k)] = r[k];
  return o;
};

async function query(sql, params = [], client = pool) {
  const res = await client.query(sql, params);
  return res.rows.map(mapRow);
}
const one = async (sql, params, client) => (await query(sql, params, client))[0] || null;

async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out = await fn(client);
    await client.query('COMMIT');
    return out;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Aplica los .sql de db/migrations en orden, una sola vez cada uno
async function migrate() {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())');
  const dir = path.join(__dirname, '..', '..', 'db', 'migrations');
  const done = new Set((await pool.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort()) {
    if (done.has(file)) continue;
    await tx(async (c) => {
      await c.query(fs.readFileSync(path.join(dir, file), 'utf8'));
      await c.query('INSERT INTO schema_migrations(name) VALUES ($1)', [file]);
    });
    console.log(`Migración aplicada: ${file}`);
  }
}

module.exports = { pool, query, one, tx, migrate };
