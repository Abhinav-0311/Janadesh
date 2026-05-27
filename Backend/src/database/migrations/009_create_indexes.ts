import { PoolClient } from 'pg';
import { Migration } from './index';

const migration: Migration = {
  id: '009_create_indexes',
  name: 'Create additional performance indexes and database optimizations',
  
  async up(client: PoolClient): Promise<void> {
    await client.query(`
      -- Additional performance indexes for complex queries
      
      -- Users table additional indexes
      CREATE INDEX IF NOT EXISTS idx_users_status_role ON users(voter_status, role);
      CREATE INDEX IF NOT EXISTS idx_users_verified_status ON users(is_verified, voter_status);
      CREATE INDEX IF NOT EXISTS idx_users_email_verified ON users(is_email_verified);
      CREATE INDEX IF NOT EXISTS idx_users_locked_until ON users(locked_until) 
        WHERE locked_until IS NOT NULL;

      -- Elections table additional indexes
      CREATE INDEX IF NOT EXISTS idx_elections_time_range ON elections(start_time, end_time);
      CREATE INDEX IF NOT EXISTS idx_elections_active ON elections(status, start_time, end_time) 
        WHERE status = 'active';
      CREATE INDEX IF NOT EXISTS idx_elections_registration_deadline ON elections(registration_deadline) 
        WHERE requires_registration = TRUE;

      -- Candidates table additional indexes
      CREATE INDEX IF NOT EXISTS idx_candidates_vote_count_desc ON candidates(vote_count DESC);
      CREATE INDEX IF NOT EXISTS idx_candidates_election_vote_count ON candidates(election_id, vote_count DESC);

      -- Votes cache table additional indexes
      CREATE INDEX IF NOT EXISTS idx_votes_cache_election_voted_at ON votes_cache(election_id, voted_at);
      CREATE INDEX IF NOT EXISTS idx_votes_cache_unverified ON votes_cache(is_verified, created_at) 
        WHERE is_verified = FALSE;

      -- Voter registrations table additional indexes
      CREATE INDEX IF NOT EXISTS idx_voter_registrations_pending ON voter_registrations(election_id, registered_at) 
        WHERE registration_status = 'pending';

      -- OTP tokens table additional indexes
      CREATE INDEX IF NOT EXISTS idx_otp_tokens_cleanup ON otp_tokens(expires_at, is_used) 
        WHERE is_used = FALSE;

      -- Create materialized view for election statistics
      CREATE MATERIALIZED VIEW election_statistics AS
      SELECT 
        e.id as election_id,
        e.title,
        e.status,
        e.start_time,
        e.end_time,
        e.total_registered_voters,
        e.total_votes_cast,
        COUNT(DISTINCT c.id) as candidate_count,
        COUNT(DISTINCT vc.id) as verified_votes_count,
        COUNT(DISTINCT vr.id) as registration_count,
        CASE 
          WHEN e.total_registered_voters > 0 
          THEN (e.total_votes_cast::DECIMAL / e.total_registered_voters * 100)
          ELSE 0 
        END as turnout_percentage,
        MAX(vc.voted_at) as last_vote_time,
        MIN(vc.voted_at) as first_vote_time
      FROM elections e
      LEFT JOIN candidates c ON e.id = c.election_id AND c.is_active = TRUE
      LEFT JOIN votes_cache vc ON e.id = vc.election_id AND vc.is_verified = TRUE
      LEFT JOIN voter_registrations vr ON e.id = vr.election_id AND vr.registration_status = 'approved'
      GROUP BY e.id, e.title, e.status, e.start_time, e.end_time, e.total_registered_voters, e.total_votes_cast;

      -- Create unique index on materialized view
      CREATE UNIQUE INDEX idx_election_statistics_election_id ON election_statistics(election_id);

      -- Create function to refresh election statistics
      CREATE OR REPLACE FUNCTION refresh_election_statistics()
      RETURNS VOID AS $$
      BEGIN
        REFRESH MATERIALIZED VIEW election_statistics;
      END;
      $$ LANGUAGE plpgsql;

      -- Create function to get database statistics
      CREATE OR REPLACE FUNCTION get_database_statistics()
      RETURNS TABLE (
        table_name TEXT,
        row_count BIGINT,
        table_size TEXT,
        index_size TEXT,
        total_size TEXT
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT 
          schemaname||'.'||relname as table_name,
          n_tup_ins - n_tup_del as row_count,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||relname)) as table_size,
          pg_size_pretty(pg_indexes_size(schemaname||'.'||relname)) as index_size,
          pg_size_pretty(pg_total_relation_size(schemaname||'.'||relname) + pg_indexes_size(schemaname||'.'||relname)) as total_size
        FROM pg_stat_user_tables 
        WHERE schemaname = 'public'
        ORDER BY pg_total_relation_size(schemaname||'.'||relname) DESC;
      END;
      $$ LANGUAGE plpgsql;

      -- Create function for database health check
      CREATE OR REPLACE FUNCTION database_health_check()
      RETURNS TABLE (
        metric TEXT,
        value TEXT,
        status TEXT
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT 
          'Active Connections'::TEXT,
          COUNT(*)::TEXT,
          CASE WHEN COUNT(*) < 80 THEN 'OK' ELSE 'WARNING' END
        FROM pg_stat_activity
        WHERE state = 'active'
        
        UNION ALL
        
        SELECT 
          'Database Size'::TEXT,
          pg_size_pretty(pg_database_size(current_database())),
          'INFO'::TEXT
        
        UNION ALL
        
        SELECT 
          'Longest Running Query'::TEXT,
          COALESCE(MAX(EXTRACT(EPOCH FROM (now() - query_start)))::TEXT || ' seconds', 'None'),
          CASE 
            WHEN MAX(EXTRACT(EPOCH FROM (now() - query_start))) > 300 THEN 'WARNING'
            ELSE 'OK' 
          END
        FROM pg_stat_activity
        WHERE state = 'active' AND query != '<IDLE>'
        
        UNION ALL
        
        SELECT 
          'Cache Hit Ratio'::TEXT,
          ROUND((sum(blks_hit) * 100.0 / sum(blks_hit + blks_read)), 2)::TEXT || '%',
          CASE 
            WHEN ROUND((sum(blks_hit) * 100.0 / sum(blks_hit + blks_read)), 2) > 95 THEN 'OK'
            ELSE 'WARNING'
          END
        FROM pg_stat_database
        WHERE datname = current_database();
      END;
      $$ LANGUAGE plpgsql;
    `);
  },

  async down(client: PoolClient): Promise<void> {
    await client.query(`
      DROP FUNCTION IF EXISTS database_health_check();
      DROP FUNCTION IF EXISTS get_database_statistics();
      DROP FUNCTION IF EXISTS refresh_election_statistics();
      DROP MATERIALIZED VIEW IF EXISTS election_statistics;
      
      -- Drop additional indexes (they will be dropped automatically with tables)
      -- This is mainly for documentation purposes
    `);
  }
};

export default migration;