const { Client } = require('pg');
require('dotenv').config({ path: '.env' });

async function main() {
  const email = process.argv[2];
  const tokenType = process.argv[3] || 'login';

  if (!email) {
    console.error('Usage: node scripts/get-latest-otp.js <email> [tokenType]');
    process.exit(1);
  }

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
      SELECT ot.token, ot.token_type, ot.created_at, ot.expires_at
      FROM otp_tokens ot
      JOIN users u ON u.id = ot.user_id
      WHERE u.email = $1
        AND ot.token_type = $2
        AND ot.is_used = false
      ORDER BY ot.created_at DESC
      LIMIT 1
      `,
      [email, tokenType]
    );

    if (result.rows.length === 0) {
      console.error(`No active OTP found for ${email} with token_type=${tokenType}`);
      process.exit(1);
    }

    const row = result.rows[0];
    console.log(
      JSON.stringify(
        {
          email,
          token: row.token,
          tokenType: row.token_type,
          createdAt: row.created_at,
          expiresAt: row.expires_at,
        },
        null,
        2
      )
    );
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
