// backend/db.js
const { Pool } = require('pg');
require('dotenv').config();

const connectionString = process.env.DATABASE_URL || 'postgres://devmehta@localhost:5432/vocalls_db';

const pool = new Pool({
  connectionString,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle PostgreSQL client', err);
});

async function query(text, params) {
  const start = Date.now();
  try {
    const res = await pool.query(text, params);
    const duration = Date.now() - start;
    // console.log('Executed query', { text: text.substring(0, 80), duration, rows: res.rowCount });
    return res;
  } catch (error) {
    console.error('Database Query Error:', error.message, { text });
    throw error;
  }
}

module.exports = {
  pool,
  query,
};
