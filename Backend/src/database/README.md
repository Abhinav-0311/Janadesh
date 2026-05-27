# Database Schema Documentation

This document describes the database schema for the Advanced Voting Platform backend.

## Overview

The database uses PostgreSQL and includes comprehensive tables for user management, election management, voting tracking, and audit logging. The schema is designed to support blockchain-based voting with traditional database caching and verification.

## Tables

### Users Table
Stores user account information with voter registration tracking.

**Key Features:**
- Unique wallet addresses for blockchain integration
- Registration number tracking
- Voter status management (eligible, voted, locked_out, suspended)
- Failed login attempt tracking with automatic lockout
- Role-based access (voter, admin, creator)

**Important Fields:**
- `wallet_address`: Ethereum wallet address (unique)
- `registration_number`: Unique voter registration identifier
- `voter_status`: Current voting eligibility status
- `failed_login_attempts`: Security tracking
- `locked_until`: Temporary lockout timestamp

### Elections Table
Manages election configurations and metadata.

**Key Features:**
- Contract address linking to blockchain smart contracts
- Multiple election types (single_choice, multiple_choice, ranked_voting)
- Registration requirements and deadlines
- Public/private election support
- Real-time vote counting

**Important Fields:**
- `contract_address`: Blockchain smart contract address
- `election_type`: Voting mechanism type
- `requires_registration`: Whether voters must register
- `registration_deadline`: Cutoff for voter registration
- `total_votes_cast`: Cached vote count

### Candidates Table
Stores candidate information for elections.

**Key Features:**
- Position-based ordering
- Vote count caching from blockchain
- Active/inactive status management
- Support for candidate descriptions and images

**Important Fields:**
- `position`: Display order in election
- `vote_count`: Cached vote total from blockchain
- `is_active`: Whether candidate is currently active

### Votes Cache Table
Caches blockchain votes for performance and verification.

**Key Features:**
- Transaction hash tracking for blockchain verification
- Block number storage for confirmation tracking
- Vote weight support for weighted voting systems
- Verification status tracking

**Important Fields:**
- `transaction_hash`: Blockchain transaction identifier
- `block_number`: Block where vote was confirmed
- `is_verified`: Whether vote has been blockchain-verified
- `vote_weight`: Weight of the vote (default 1)

### Voter Registrations Table
Manages election-specific voter registration.

**Key Features:**
- Per-election registration tracking
- Approval workflow (pending, approved, rejected, expired)
- Registration number generation
- Approval audit trail

**Important Fields:**
- `registration_status`: Current registration state
- `registration_number`: Unique per-election identifier
- `approved_by`: Admin who approved registration
- `rejection_reason`: Reason for rejection if applicable

### OTP Tokens Table
Handles one-time password tokens for authentication.

**Key Features:**
- Multiple token types (email_verification, login, password_reset, voting_access)
- Attempt limiting with configurable max attempts
- Automatic expiration
- Purpose-specific data storage

**Important Fields:**
- `token_type`: Purpose of the OTP token
- `expires_at`: Token expiration timestamp
- `attempts`: Current attempt count
- `max_attempts`: Maximum allowed attempts

### Voter Eligibility Table
Comprehensive voter status tracking per election.

**Key Features:**
- Per-election eligibility determination
- Voting status tracking
- Lockout management with reasons
- Verification audit trail

**Important Fields:**
- `is_eligible`: Whether voter can participate
- `has_voted`: Whether voter has cast their vote
- `lockout_until`: Temporary lockout expiration
- `eligibility_reason`: Reason for eligibility status

### Audit Logs Table
Comprehensive system activity logging.

**Key Features:**
- All system actions logged
- Before/after value tracking
- IP address and user agent logging
- Success/failure tracking
- Flexible metadata storage

**Important Fields:**
- `action`: Type of action performed
- `resource_type`: Type of resource affected
- `old_values`/`new_values`: Change tracking (JSON)
- `ip_address`: Source IP address
- `success`: Whether action succeeded

## Database Functions

### Utility Functions
- `update_updated_at_column()`: Automatically updates `updated_at` timestamps
- `cleanup_expired_otp_tokens()`: Removes old OTP tokens
- `cleanup_old_audit_logs(days)`: Removes old audit entries

### Audit Functions
- `log_audit_event()`: Standardized audit logging
- `database_health_check()`: System health monitoring
- `get_database_statistics()`: Table size and row count statistics

### Voter Functions
- `is_voter_locked_out(user_id, election_id)`: Check lockout status
- `get_voter_status(user_id, election_id)`: Comprehensive voter status

### Maintenance Functions
- `refresh_election_statistics()`: Updates materialized view

## Materialized Views

### election_statistics
Pre-computed election statistics for performance:
- Candidate counts
- Vote counts and verification status
- Registration statistics
- Turnout percentages
- Voting timeframes

## Indexes

The schema includes comprehensive indexing for:
- Primary key lookups
- Foreign key relationships
- Common query patterns
- Composite queries
- Partial indexes for filtered queries

**Performance Indexes:**
- User lookups by wallet, email, registration number
- Election queries by status, time ranges, creator
- Vote queries by election, voter, verification status
- Registration queries by status and election
- OTP token lookups by user and type

## Migration System

The database uses a custom migration system with:
- Sequential migration execution
- Rollback capability
- Migration status tracking
- Automatic dependency management

**Migration Files:**
1. `001_create_users_table.ts` - User management
2. `002_create_elections_table.ts` - Election management
3. `003_create_candidates_table.ts` - Candidate management
4. `004_create_votes_cache_table.ts` - Vote caching
5. `005_create_voter_registrations_table.ts` - Registration management
6. `006_create_otp_tokens_table.ts` - Authentication tokens
7. `007_create_voter_eligibility_table.ts` - Eligibility tracking
8. `008_create_audit_logs_table.ts` - Audit logging
9. `009_create_indexes.ts` - Performance optimization

## Repository Pattern

The application uses a repository pattern for database access:
- `BaseRepository`: Common CRUD operations
- `UserRepository`: User-specific operations
- `ElectionRepository`: Election management
- `CandidateRepository`: Candidate operations
- `VoteCacheRepository`: Vote caching and verification
- `VoterRegistrationRepository`: Registration management
- `OtpTokenRepository`: Token management

## Database Management CLI

Use the database CLI for management tasks:

```bash
# Initialize database with migrations
npm run db:init

# Initialize with sample data
npm run db:init:seeds

# Run migrations only
npm run db:migrate

# Check database status
npm run db:status

# Run health check
npm run db:health

# View database statistics
npm run db:stats

# Clean up old data
npm run db:cleanup

# Reset database (WARNING: destroys all data)
npm run db:reset
```

## Security Considerations

- All sensitive operations are logged in audit_logs
- User lockout mechanisms prevent brute force attacks
- OTP tokens have attempt limits and expiration
- Voter eligibility is tracked per election
- Database functions validate data integrity
- Indexes support efficient queries without exposing sensitive data

## Performance Optimizations

- Materialized views for complex aggregations
- Comprehensive indexing strategy
- Connection pooling with configurable limits
- Query result caching where appropriate
- Efficient pagination support
- Bulk operations for administrative tasks

## Backup and Recovery

- Regular automated backups recommended
- Point-in-time recovery capability
- Migration rollback support
- Data export/import utilities
- Audit trail preservation