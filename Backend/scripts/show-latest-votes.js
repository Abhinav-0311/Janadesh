const { Client } = require('pg');
require('dotenv').config({ path: '.env' });

async function main() {
  const limitArg = Number(process.argv[2] || 10);
  const limit = Number.isFinite(limitArg) && limitArg > 0 ? limitArg : 10;

  const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });

  await client.connect();
  try {
    const result = await client.query(
      `
      SELECT
        vc.id,
        vc.election_id,
        e.title AS election_title,
        vc.voter_id,
        u.email AS voter_email,
        vc.candidate_id,
        c.name AS candidate_name,
        vc.transaction_hash,
        vc.is_verified,
        vc.voted_at
      FROM votes_cache vc
      LEFT JOIN elections e ON e.id = vc.election_id
      LEFT JOIN users u ON u.id = vc.voter_id
      LEFT JOIN candidates c ON c.id = vc.candidate_id
      ORDER BY vc.voted_at DESC
      LIMIT $1
      `,
      [limit]
    );

    console.log(JSON.stringify({ count: result.rows.length, votes: result.rows }, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
