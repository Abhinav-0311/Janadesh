import { PoolClient } from 'pg';
import { Migration } from './index';

const migration: Migration = {
  id: '008_create_audit_logs_table',
  name: 'Create audit logs table for comprehensive system activity tracking',
  
  async up(client: PoolClient): Promise<void> {
    await client.query(`
      CREATE TABLE audit_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        action VARCHAR(100) NOT NULL,
        resource_type VARCHAR(50) NOT NULL CHECK (
          resource_type IN ('user', 'election', 'candidate', 'vote', 'system', 'auth', 'registration')
        ),
        resource_id UUID,
        old_values TEXT, -- JSON string
        new_values TEXT, -- JSON string
        ip_address INET,
        user_agent TEXT,
        success BOOLEAN DEFAULT TRUE,
        error_message TEXT,
        metadata TEXT, -- JSON string for additional context
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        
        -- Constraints
        CONSTRAINT valid_error_data CHECK (
          (success = FALSE AND error_message IS NOT NULL) OR
          (success = TRUE)
        )
      );

      -- Create indexes for performance and querying
      CREATE INDEX idx_audit_logs_user_id ON audit_logs(user_id);
      CREATE INDEX idx_audit_logs_action ON audit_logs(action);
      CREATE INDEX idx_audit_logs_resource_type ON audit_logs(resource_type);
      CREATE INDEX idx_audit_logs_resource_id ON audit_logs(resource_id);
      CREATE INDEX idx_audit_logs_success ON audit_logs(success);
      CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
      CREATE INDEX idx_audit_logs_ip_address ON audit_logs(ip_address);

      -- Composite indexes for common audit queries
      CREATE INDEX idx_audit_logs_user_action ON audit_logs(user_id, action);
      CREATE INDEX idx_audit_logs_resource_type_id ON audit_logs(resource_type, resource_id);
      CREATE INDEX idx_audit_logs_user_created_at ON audit_logs(user_id, created_at);
      CREATE INDEX idx_audit_logs_action_created_at ON audit_logs(action, created_at);
      CREATE INDEX idx_audit_logs_resource_created_at ON audit_logs(resource_type, created_at);

      -- Partial indexes for failed operations
      CREATE INDEX idx_audit_logs_failures ON audit_logs(user_id, action, created_at) 
        WHERE success = FALSE;

      -- Create function to log audit events
      CREATE OR REPLACE FUNCTION log_audit_event(
        p_user_id UUID,
        p_action VARCHAR(100),
        p_resource_type VARCHAR(50),
        p_resource_id UUID DEFAULT NULL,
        p_old_values TEXT DEFAULT NULL,
        p_new_values TEXT DEFAULT NULL,
        p_ip_address INET DEFAULT NULL,
        p_user_agent TEXT DEFAULT NULL,
        p_success BOOLEAN DEFAULT TRUE,
        p_error_message TEXT DEFAULT NULL,
        p_metadata TEXT DEFAULT NULL
      )
      RETURNS UUID AS $$
      DECLARE
        log_id UUID;
      BEGIN
        INSERT INTO audit_logs (
          user_id, action, resource_type, resource_id,
          old_values, new_values, ip_address, user_agent,
          success, error_message, metadata
        ) VALUES (
          p_user_id, p_action, p_resource_type, p_resource_id,
          p_old_values, p_new_values, p_ip_address, p_user_agent,
          p_success, p_error_message, p_metadata
        ) RETURNING id INTO log_id;
        
        RETURN log_id;
      END;
      $$ LANGUAGE plpgsql;

      -- Create function to clean up old audit logs (older than specified days)
      CREATE OR REPLACE FUNCTION cleanup_old_audit_logs(days_to_keep INTEGER DEFAULT 365)
      RETURNS INTEGER AS $$
      DECLARE
        deleted_count INTEGER;
      BEGIN
        DELETE FROM audit_logs 
        WHERE created_at < CURRENT_TIMESTAMP - (days_to_keep || ' days')::INTERVAL;
        
        GET DIAGNOSTICS deleted_count = ROW_COUNT;
        RETURN deleted_count;
      END;
      $$ LANGUAGE plpgsql;

      -- Create view for recent audit activity
      CREATE VIEW recent_audit_activity AS
      SELECT 
        al.id,
        al.user_id,
        u.username,
        u.email,
        al.action,
        al.resource_type,
        al.resource_id,
        al.success,
        al.error_message,
        al.ip_address,
        al.created_at
      FROM audit_logs al
      LEFT JOIN users u ON al.user_id = u.id
      WHERE al.created_at >= CURRENT_TIMESTAMP - INTERVAL '7 days'
      ORDER BY al.created_at DESC;
    `);
  },

  async down(client: PoolClient): Promise<void> {
    await client.query(`
      DROP VIEW IF EXISTS recent_audit_activity;
      DROP FUNCTION IF EXISTS cleanup_old_audit_logs(INTEGER);
      DROP FUNCTION IF EXISTS log_audit_event(UUID, VARCHAR, VARCHAR, UUID, TEXT, TEXT, INET, TEXT, BOOLEAN, TEXT, TEXT);
      DROP TABLE IF EXISTS audit_logs CASCADE;
    `);
  }
};

export default migration;