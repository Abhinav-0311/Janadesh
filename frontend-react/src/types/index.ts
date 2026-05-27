// User types
export interface User {
  id: string
  walletAddress: string
  email: string
  username: string
  firstName?: string
  lastName?: string
  registrationNumber?: string
  role: 'voter' | 'admin' | 'creator'
  isVerified: boolean
  createdAt: string
  updatedAt: string
}

// Voter status types
export interface VoterStatus {
  isEligible: boolean
  hasVoted: boolean
  isLockedOut: boolean
  registrationStatus: 'pending' | 'verified' | 'rejected'
  lockoutReason?: string
  votingHistory?: VotingRecord[]
}

export interface VotingRecord {
  electionId: string
  electionTitle: string
  votedAt: string
  transactionHash: string
}

// Election types
export interface Candidate {
  id: string
  electionId: string
  name: string
  description: string
  imageUrl?: string
  position: number
  voteCount?: number
}

export interface Election {
  id: string
  contractAddress: string
  title: string
  description: string
  creatorId: string
  electionType: 'single' | 'multiple' | 'ranked'
  startTime: string
  endTime: string
  isPublic: boolean
  status: 'pending' | 'active' | 'ended' | 'cancelled'
  candidates: Candidate[]
  totalVotes?: number
  createdAt: string
  updatedAt: string
}

// Voting types
export interface Vote {
  id: string
  electionId: string
  voterAddress: string
  candidateId: string
  transactionHash: string
  blockNumber?: number
  votedAt: string
}

export interface VoteSubmission {
  electionId: string
  candidateId?: string
  candidateIds?: string[]
  transactionHash?: string
}

// API Response types
export interface ApiResponse<T = any> {
  success: boolean
  data?: T
  error?: {
    code: string
    message: string
    details?: any
  }
  timestamp: string
}

// WebSocket types
export interface WebSocketMessage {
  type: 'election_update' | 'vote_confirmation' | 'system_notification'
  data: any
  timestamp: string
}

// Form types
export interface LoginForm {
  email: string
  password: string
}

export interface RegisterForm {
  email: string
  username: string
  firstName: string
  lastName: string
  walletAddress: string
}

export interface ElectionForm {
  title: string
  description: string
  electionType: 'single' | 'multiple' | 'ranked'
  startTime: string
  endTime: string
  isPublic: boolean
  candidates: Omit<Candidate, 'id' | 'electionId' | 'voteCount'>[]
}

// Utility types
export type LoadingState = 'idle' | 'loading' | 'succeeded' | 'failed'

export interface PaginationParams {
  page: number
  limit: number
  sortBy?: string
  sortOrder?: 'asc' | 'desc'
}

export interface FilterParams {
  status?: string
  search?: string
  electionType?: string
  dateRange?: {
    start: string
    end: string
  }
}
