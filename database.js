const sqlite3 = require('sqlite3').verbose();
const { open } = require('sqlite');

async function initDB() {
  const db = await open({
    filename: './entradas.db',
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS tickets (
      id TEXT PRIMARY KEY,
      comprador TEXT NOT NULL,
      estado TEXT DEFAULT 'PAGADO',
      fecha_uso DATETIME
    );
  `);

  return db;
}

module.exports = initDB;