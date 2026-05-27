const { Client } = require('pg');
const crypto = require('crypto');
require('dotenv').config({ path: '.env' });

function usage() {
  console.error('Usage: node scripts/bootstrap-user.js <email> [voter|creator|admin]');
  process.exit(1);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function createDbClient() {
  return new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
  });
}

function sanitizeUsernameBase(email) {
  return email
    .toLowerCase()
    .split('@')[0]
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 12) || 'user';
}

function deriveWalletAddress(email) {
  const hex = crypto.createHash('sha256').update(`wallet:${email}`).digest('hex').slice(0, 40);
  return `0x${hex}`;
}

function normalizeRole(inputRole) {
  const role = (inputRole || 'voter').toLowerCase();
  if (!['voter', 'creator', 'admin'].includes(role)) {
    throw new Error(`Invalid role: ${inputRole}`);
  }
  return role;
}

async function main() {
  const emailArg = process.argv[2];
  const roleArg = process.argv[3];

  if (!emailArg || !isValidEmail(emailArg)) {
    usage();
  }

  const email = emailArg.toLowerCase();
  const desiredRole = normalizeRole(roleArg);
  const walletAddress = deriveWalletAddress(email);

  const client = createDbClient();
  await client.connect();

  try {
    const existing = await client.query(
      `
      SELECT id, email, role, wallet_address
      FROM users
      WHERE email = $1
      LIMIT 1
      `,
      [email]
    );

    if (existing.rows.length > 0) {
      const current = existing.rows[0];

      await client.query(
        `
        UPDATE users
        SET
          role = CASE WHEN role = 'admin' THEN role ELSE $2 END,
          wallet_address = CASE
            WHEN wallet_address IS NULL OR wallet_address = '' THEN $3
            ELSE wallet_address
          END,
          is_verified = true,
          is_email_verified = true,
          voter_status = 'eligible',
          failed_login_attempts = 0,
          locked_until = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE email = $1
        RETURNING id, email, role, wallet_address, is_verified, is_email_verified, voter_status
        `,
        [email, desiredRole, walletAddress]
      );

      console.log(
        JSON.stringify(
          {
            action: 'updated_existing_user',
            requestedRole: desiredRole,
            previousRole: current.role,
            email,
          },
          null,
          2
        )
      );
      return;
    }

    const suffix = crypto.randomBytes(3).toString('hex');
    const username = `${sanitizeUsernameBase(email)}_${suffix}`;
    const registrationNumber = `REG-DEMO-${Date.now()}-${suffix}`;

    const inserted = await client.query(
      `
      INSERT INTO users (
        email,
        wallet_address,
        username,
        first_name,
        last_name,
        registration_number,
        is_verified,
        is_email_verified,
        role,
        voter_status
      ) VALUES (
        $1, $2, $3, 'Demo', 'User', $4, true, true, $5, 'eligible'
      )
      RETURNING id, email, role, wallet_address, is_verified, is_email_verified, voter_status
      `,
      [email, walletAddress, username, registrationNumber, desiredRole]
    );

    console.log(
      JSON.stringify(
        {
          action: 'created_user',
          requestedRole: desiredRole,
          user: inserted.rows[0],
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
  console.error(error.message || error);
  process.exit(1);
});
