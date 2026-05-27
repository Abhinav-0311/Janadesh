import { VoteSubmission, ApiResponse, VoterStatus } from '../../types'

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || '/api/v1'

class VotingApiService {
  private getAuthHeaders(): HeadersInit {
    const token = localStorage.getItem('auth_token')
    return {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
    }
  }

  private async handleResponse<T = any>(response: Response): Promise<T> {
    const payload = await response.json().catch(() => ({}))
    if (!response.ok || payload?.success === false) {
      throw new Error(payload?.error?.message || `HTTP ${response.status}: ${response.statusText}`)
    }
    return payload as T
  }

  async submitVote(voteData: VoteSubmission): Promise<{ transactionHash: string; blockNumber?: number }> {
    const response = await fetch(`${API_BASE_URL}/voting/submit`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(voteData),
    })

    const result = await this.handleResponse<ApiResponse<any>>(response)
    const txHash =
      result?.data?.transactionHash ||
      result?.data?.vote?.transaction_hash ||
      result?.data?.vote?.transactionHash

    if (!txHash) {
      throw new Error('Failed to submit vote')
    }

    return {
      transactionHash: txHash,
      blockNumber: result?.data?.blockNumber ?? result?.data?.vote?.block_number,
    }
  }

  async getVoterStatus(electionId: string): Promise<VoterStatus> {
    const response = await fetch(`${API_BASE_URL}/voting/status/${electionId}`, {
      headers: this.getAuthHeaders(),
    })

    const result = await this.handleResponse<ApiResponse<any>>(response)
    const userStatus = (result as any)?.data?.userStatus || {}

    return {
      isEligible: Boolean(userStatus.eligible),
      hasVoted: Boolean(userStatus.hasVoted),
      isLockedOut: false,
      registrationStatus: userStatus.eligible ? 'verified' : 'pending',
    }
  }

  async checkVotingEligibility(electionId: string): Promise<{
    isEligible: boolean
    reason?: string
    hasVoted: boolean
  }> {
    const response = await fetch(`${API_BASE_URL}/voting/eligibility/${electionId}`, {
      headers: this.getAuthHeaders(),
    })

    const result = await this.handleResponse<ApiResponse<any>>(response)
    const data = (result as any)?.data || {}

    return {
      isEligible: Boolean(data.isEligible ?? data.eligible),
      reason: data.reason,
      hasVoted: Boolean(data.hasVoted),
    }
  }

  async getVoteConfirmation(transactionHash: string): Promise<{
    confirmed: boolean
    blockNumber?: number
    timestamp?: string
  }> {
    const response = await fetch(`${API_BASE_URL}/voting/confirmation/${transactionHash}`, {
      headers: this.getAuthHeaders(),
    })

    const result = await this.handleResponse<ApiResponse<any>>(response)
    const data = (result as any)?.data || {}

    return {
      confirmed: Boolean(data.confirmed),
      blockNumber: data.blockNumber,
      timestamp: data.timestamp,
    }
  }
}

export const votingApi = new VotingApiService()
