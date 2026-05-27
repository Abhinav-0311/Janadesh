const { Client } = require('pg');
const crypto = require('crypto');
require('dotenv').config({ path: '.env' });

function walletFrom(seed) {
  return `0x${crypto.createHash('sha256').update(`wallet:${seed}`).digest('hex').slice(0, 40)}`;
}

function contractFrom(seed) {
  return `0x${crypto.createHash('sha256').update(`contract:${seed}`).digest('hex').slice(0, 40)}`;
}

async function insertUser(client, user) {
  const result = await client.query(
    `
      INSERT INTO users (
        wallet_address,
        email,
        username,
        first_name,
        last_name,
        registration_number,
        is_verified,
        is_email_verified,
        role,
        voter_status
      )
      VALUES ($1,$2,$3,$4,$5,$6,true,true,$7,'eligible')
      RETURNING id, email, role
    `,
    [
      user.walletAddress,
      user.email,
      user.username,
      user.firstName,
      user.lastName,
      user.registrationNumber,
      user.role,
    ]
  );

  return result.rows[0];
}

async function insertElection(client, election) {
  const result = await client.query(
    `
      INSERT INTO elections (
        contract_address,
        title,
        description,
        creator_id,
        election_type,
        start_time,
        end_time,
        is_public,
        status,
        max_votes_per_voter,
        requires_registration,
        total_registered_voters,
        total_votes_cast
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,1,false,0,0)
      RETURNING id, title, status, start_time, end_time
    `,
    [
      election.contractAddress,
      election.title,
      election.description,
      election.creatorId,
      election.electionType,
      election.startTime,
      election.endTime,
      election.status,
    ]
  );

  return result.rows[0];
}

async function insertCandidates(client, electionId, candidates) {
  let totalVotes = 0;

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const voteCount = Number(candidate.voteCount || 0);
    totalVotes += voteCount;

    await client.query(
      `
        INSERT INTO candidates (
          election_id,
          name,
          description,
          position,
          vote_count,
          is_active
        )
        VALUES ($1,$2,$3,$4,$5,true)
      `,
      [electionId, candidate.name, candidate.description, index + 1, voteCount]
    );
  }

  await client.query('UPDATE elections SET total_votes_cast = $2 WHERE id = $1', [electionId, totalVotes]);
}

async function resetData(client) {
  const cleanupStatements = [
    'DELETE FROM token_blacklist',
    'DELETE FROM refresh_tokens',
    'DELETE FROM otp_tokens',
    'DELETE FROM voter_eligibility',
    'DELETE FROM voter_registrations',
    'DELETE FROM votes_cache',
    'DELETE FROM candidates',
    'DELETE FROM elections',
    'DELETE FROM audit_logs',
    'DELETE FROM seeds',
    'DELETE FROM users',
  ];

  for (const statement of cleanupStatements) {
    await client.query(statement);
  }
}

async function main() {
  const frontendBase = process.env.FRONTEND_BASE_URL || 'http://localhost:5173';

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
    await client.query('BEGIN');
    await resetData(client);

    const admin = await insertUser(client, {
      walletAddress: walletFrom('admin'),
      email: 'admin@voting.local',
      username: 'admin',
      firstName: 'System',
      lastName: 'Admin',
      registrationNumber: 'ADM-001',
      role: 'admin',
    });

    const creator = await insertUser(client, {
      walletAddress: walletFrom('creator1'),
      email: 'creator1@voting.local',
      username: 'creator1',
      firstName: 'Election',
      lastName: 'Manager',
      registrationNumber: 'CRT-001',
      role: 'creator',
    });

    const voter = await insertUser(client, {
      walletAddress: walletFrom('demo-voter'),
      email: 'demo.voter@janadesh.local',
      username: 'demo_voter',
      firstName: 'Demo',
      lastName: 'Voter',
      registrationNumber: 'VTR-001',
      role: 'voter',
    });

    const now = Date.now();

    const electionsSeed = [
      {
        title: 'Student Council President 2026',
        description: 'General student body election for the position of council president.',
        electionType: 'single_choice',
        startTime: new Date(now - 2 * 60 * 60 * 1000),
        endTime: new Date(now + 48 * 60 * 60 * 1000),
        status: 'active',
        candidates: [
          { name: 'Aarav Malhotra', description: 'Campus reform and transparency agenda', voteCount: 124 },
          { name: 'Sana Verma', description: 'Student welfare and mental health support', voteCount: 141 },
          { name: 'Ritvik Sharma', description: 'Academic innovation and clubs expansion', voteCount: 97 },
        ],
      },
      {
        title: 'Cultural Secretary 2026',
        description: 'Election for events, festivals, and cultural committee leadership.',
        electionType: 'single_choice',
        startTime: new Date(now - 60 * 60 * 1000),
        endTime: new Date(now + 36 * 60 * 60 * 1000),
        status: 'active',
        candidates: [
          { name: 'Meera Singh', description: 'Inclusive festivals and inter-college collaborations', voteCount: 88 },
          { name: 'Karthik Rao', description: 'High-impact annual fest strategy', voteCount: 102 },
        ],
      },
      {
        title: 'Sports Committee Chair 2026',
        description: 'Election to lead college sports events and athlete support initiatives.',
        electionType: 'single_choice',
        startTime: new Date(now - 30 * 60 * 1000),
        endTime: new Date(now + 24 * 60 * 60 * 1000),
        status: 'active',
        candidates: [
          { name: 'Dev Khanna', description: 'Infrastructure-first sports plan', voteCount: 56 },
          { name: 'Nisha Iyer', description: 'Performance coaching and league development', voteCount: 63 },
          { name: 'Harsh Gupta', description: 'Grassroots participation and wellness programs', voteCount: 51 },
        ],
      },
      {
        title: 'Library Council Lead 2026',
        description: 'Completed election for library modernization and reading culture programs.',
        electionType: 'single_choice',
        startTime: new Date(now - 72 * 60 * 60 * 1000),
        endTime: new Date(now - 2 * 60 * 60 * 1000),
        status: 'ended',
        candidates: [
          { name: 'Ananya Das', description: 'Digital library and research access expansion', voteCount: 119 },
          { name: 'Vivek Menon', description: 'Extended reading spaces and student circles', voteCount: 103 },
        ],
      },
      {
        title: 'Innovation Club Lead 2026',
        description: 'Upcoming election for startup and innovation club leadership.',
        electionType: 'single_choice',
        startTime: new Date(now + 24 * 60 * 60 * 1000),
        endTime: new Date(now + 72 * 60 * 60 * 1000),
        status: 'pending',
        candidates: [
          { name: 'Ishaan Arora', description: 'Mentorship and prototype lab expansion', voteCount: 0 },
          { name: 'Priya Nair', description: 'Incubation pipeline and hackathon ecosystem', voteCount: 0 },
        ],
      },
    ];

    const seededElections = [];

    for (const seed of electionsSeed) {
      const election = await insertElection(client, {
        contractAddress: contractFrom(seed.title),
        title: seed.title,
        description: seed.description,
        creatorId: creator.id,
        electionType: seed.electionType,
        startTime: seed.startTime,
        endTime: seed.endTime,
        status: seed.status,
      });

      await insertCandidates(client, election.id, seed.candidates);
      seededElections.push(election);
    }

    await client.query('COMMIT');

    console.log(
      JSON.stringify(
        {
          message: 'Database runtime data reset and demo dataset inserted successfully.',
          users: [admin, creator, voter],
          activeElectionCount: seededElections.filter(e => e.status === 'active').length,
          elections: seededElections.map(election => ({
            id: election.id,
            title: election.title,
            status: election.status,
            frontendVoteUrl: `${frontendBase}/vote/${election.id}`,
          })),
        },
        null,
        2
      )
    );
  } catch (error) {
    await client.query('ROLLBACK');
    console.error(error.message || error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
