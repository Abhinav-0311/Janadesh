export interface BaseModel {
  id: string;
  created_at: Date;
  updated_at: Date;
}

export interface User extends BaseModel {
  wallet_address?: string;
  email: string;
  username: string;
  first_name?: string;
  last_name?: string;
  registration_number: string;
  is_verified: boolean;
  is_email_verified: boolean;
  role: 'voter' | 'admin' | 'creator';
  voter_status: 'eligible' | 'voted' | 'locked_out' | 'suspended';
  last_login?: Date;
  failed_login_attempts: number;
  locked_until?: Date;
}

export interface Election extends BaseModel {
  contract_address: string;
  title: string;
  description?: string;
  creator_id: string;
  election_type: 'single_choice' | 'multiple_choice' | 'ranked_voting';
  start_time: Date;
  end_time: Date;
  is_public: boolean;
  status: 'pending' | 'active' | 'ended' | 'cancelled';
  max_votes_per_voter: number;
  requires_registration: boolean;
  registration_deadline?: Date;
  total_registered_voters: number;
  total_votes_cast: number;
}

export interface Candidate extends BaseModel {
  election_id: string;
  name: string;
  description?: string;
  image_url?: string;
  position: number;
  vote_count: number;
  is_active: boolean;
}

export interface VoteCache extends BaseModel {
  election_id: string;
  voter_address: string;
  voter_id: string;
  candidate_id: string;
  transaction_hash: string;
  block_number?: number;
  vote_weight: number;
  is_verified: boolean;
  voted_at: Date;
}

export interface VoterRegistration extends BaseModel {
  user_id: string;
  election_id: string;
  registration_number: string;
  registration_status: 'pending' | 'approved' | 'rejected' | 'expired';
  registered_at: Date;
  approved_at?: Date;
  approved_by?: string;
  rejection_reason?: string;
}

export interface OtpToken extends BaseModel {
  user_id: string;
  token: string;
  token_type: 'email_verification' | 'login' | 'password_reset' | 'voting_access';
  expires_at: Date;
  is_used: boolean;
  used_at?: Date;
  attempts: number;
  max_attempts: number;
  purpose_data?: string; // JSON string for additional context
}

export interface VoterEligibility extends BaseModel {
  user_id: string;
  election_id: string;
  is_eligible: boolean;
  eligibility_reason?: string;
  verified_at?: Date;
  verified_by?: string;
  registration_required: boolean;
  has_voted: boolean;
  vote_timestamp?: Date;
  lockout_until?: Date;
  lockout_reason?: string;
}

export interface AuditLog extends BaseModel {
  user_id?: string;
  action: string;
  resource_type: 'user' | 'election' | 'candidate' | 'vote' | 'system';
  resource_id?: string;
  old_values?: string; // JSON string
  new_values?: string; // JSON string
  ip_address?: string;
  user_agent?: string;
  success: boolean;
  error_message?: string;
  metadata?: string; // JSON string for additional context
}

// Database query result types
export interface QueryResult<T = any> {
  rows: T[];
  rowCount: number;
  command: string;
}

// Pagination types
export interface PaginationOptions {
  page: number;
  limit: number;
  sort_by?: string;
  sort_order?: 'ASC' | 'DESC';
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
    has_next: boolean;
    has_prev: boolean;
  };
}