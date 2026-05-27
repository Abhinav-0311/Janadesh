const { Client } = require('pg');
require('dotenv').config({ path: '.env' });
const crypto = require('crypto');

const API_BASE = process.env.RUNTIME_API_BASE || 'http://localhost:3001/api/v1';

async function callApi(path, { method = 'GET', token, body } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload?.success === false) {
    throw new Error(
      `API ${method} ${path} failed (${response.status}): ${payload?.error?.message || response.statusText}`
    );
  }

  return payload;
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
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 12) || 'user';
}

function deriveWalletAddress(email) {
  const hex = crypto.createHash('sha256').update(`wallet:${email}`).digest('hex').slice(0, 40);
  return `0x${hex}`;
}

async function ensureUser(email, desiredRole) {
  const client = createDbClient();
  await client.connect();
  try {
    const walletAddress = deriveWalletAddress(email);

    const existing = await client.query(
      `
      SELECT id, email, role
      FROM users
      WHERE email = $1
      LIMIT 1
      `,
      [email]
    );

    if (existing.rows.length > 0) {
      const roleUpdate =
        desiredRole === 'creator'
          ? `CASE WHEN role = 'admin' THEN role ELSE 'creator' END`
          : `'voter'`;

      await client.query(
        `
        UPDATE users
        SET
          role = ${roleUpdate},
          wallet_address = CASE
            WHEN wallet_address IS NULL OR wallet_address = '' THEN $2
            ELSE wallet_address
          END,
          is_verified = true,
          is_email_verified = true,
          voter_status = 'eligible',
          failed_login_attempts = 0,
          locked_until = NULL,
          updated_at = CURRENT_TIMESTAMP
        WHERE email = $1
        `,
        [email, walletAddress]
      );
      return;
    }

    const uniqueSuffix = crypto.randomBytes(3).toString('hex');
    const username = `${sanitizeUsernameBase(email)}_${uniqueSuffix}`;
    const registrationNumber = `REG-${desiredRole.toUpperCase()}-${Date.now()}-${uniqueSuffix}`;

    await client.query(
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
        $1, $2, $3, 'Runtime', $4, $5, true, true, $6, 'eligible'
      )
      `,
      [email, walletAddress, username, desiredRole === 'creator' ? 'Creator' : 'Voter', registrationNumber, desiredRole]
    );
  } finally {
    await client.end();
  }
}

async function getOtpToken(email, tokenType) {
  const client = createDbClient();
  await client.connect();
  try {
    const result = await client.query(
      `
      SELECT ot.token
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

    return result.rows[0]?.token || null;
  } finally {
    await client.end();
  }
}

async function queryDb(text, params = []) {
  const client = createDbClient();
  await client.connect();
  try {
    return await client.query(text, params);
  } finally {
    await client.end();
  }
}

async function main() {
  const creatorEmail = process.env.RUNTIME_CREATOR_EMAIL || 'creator1@voting.local';
  const voterEmail = process.env.RUNTIME_VOTER_EMAIL || 'voter1@voting.local';

  await ensureUser(creatorEmail, 'creator');
  await ensureUser(voterEmail, 'voter');

  await callApi('/auth/login/initiate', { method: 'POST', body: { email: creatorEmail } });
  const creatorOtp = await getOtpToken(creatorEmail, 'login');
  if (!creatorOtp) {
    throw new Error('Failed to fetch creator OTP token from DB');
  }

  const creatorLogin = await callApi('/auth/login/complete', {
    method: 'POST',
    body: { email: creatorEmail, otpToken: creatorOtp },
  });
  const creatorToken = creatorLogin.data.tokens.accessToken;

  const now = Date.now();
  const startTime = new Date(now - 60 * 1000).toISOString();
  const endTime = new Date(now + 24 * 60 * 60 * 1000).toISOString();
  const electionTitle = `Runtime E2E ${new Date(now).toISOString()}`;

  const createElection = await callApi('/elections', {
    method: 'POST',
    token: creatorToken,
    body: {
      title: electionTitle,
      description: 'Runtime validation election for vote + DB persistence',
      electionType: 'single_choice',
      startTime,
      endTime,
      isPublic: true,
      candidates: [
        { name: 'Candidate A', description: 'Primary candidate' },
        { name: 'Candidate B', description: 'Secondary candidate' },
      ],
    },
  });

  const electionId = createElection.data.election.id;
  const candidateId = createElection.data.candidates[0].id;

  await callApi('/auth/login/initiate', { method: 'POST', body: { email: voterEmail } });
  const voterOtp = await getOtpToken(voterEmail, 'login');
  if (!voterOtp) {
    throw new Error('Failed to fetch voter OTP token from DB');
  }

  const voterLogin = await callApi('/auth/login/complete', {
    method: 'POST',
    body: { email: voterEmail, otpToken: voterOtp },
  });
  const voterToken = voterLogin.data.tokens.accessToken;

  const eligibility = await callApi(`/voting/eligibility/${electionId}`, {
    token: voterToken,
  });

  const vote = await callApi('/voting/submit', {
    method: 'POST',
    token: voterToken,
    body: {
      electionId,
      candidateId,
    },
  });

  const transactionHash = vote.data.transactionHash;
  const confirmation = await callApi(`/voting/confirmation/${transactionHash}`, {
    token: voterToken,
  });

  const voteCountResult = await queryDb(
    'SELECT COUNT(*)::int AS count FROM votes_cache WHERE election_id = $1',
    [electionId]
  );
  const voteTxResult = await queryDb(
    'SELECT transaction_hash, is_verified FROM votes_cache WHERE transaction_hash = $1 LIMIT 1',
    [transactionHash]
  );

  const output = {
    electionId,
    candidateId,
    eligibility: eligibility.data,
    voteTransactionHash: transactionHash,
    confirmation: confirmation.data,
    dbVoteCountForElection: voteCountResult.rows[0].count,
    dbTransactionRecord: voteTxResult.rows[0] || null,
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
