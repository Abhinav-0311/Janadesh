const { Client } = require('pg');
require('dotenv').config();

async function createDatabase() {
  const databaseName = process.env.DB_NAME || 'voting_platform';
  const escapedDatabaseName = databaseName.replace(/"/g, '""');

  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: 'postgres',
  });

  try {
    await client.connect();
    console.log('Connected to PostgreSQL server');

    const result = await client.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [databaseName]
    );

    if (result.rows.length === 0) {
      await client.query(`CREATE DATABASE "${escapedDatabaseName}"`);
      console.log(`Database "${databaseName}" created successfully.`);
    } else {
      console.log(`Database "${databaseName}" already exists.`);
    }
  } catch (error) {
    console.error('Error:', error.message);

    if (error.code === '28P01') {
      console.error('Password authentication failed. Check DB_USER and DB_PASSWORD in Backend/.env.');
    }
  } finally {
    await client.end();
  }
}

createDatabase();
