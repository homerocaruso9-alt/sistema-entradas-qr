const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      comprador TEXT NOT NULL,
      estado TEXT DEFAULT 'PAGADO',
      fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      fecha_uso TIMESTAMP
    );
  `);

  console.log('Base de datos conectada a Supabase correctamente.');
  return pool;
}

module.exports = initDB;