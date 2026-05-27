import { User } from '../../types'

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || '/api/v1'

interface LoginResponse {
  user: User
  token: string
}

interface RegistrationData {
  email: string
  username: string
  firstName?: string
  lastName?: string
  registrationNumber?: string
}

interface LoginIdentifier {
  email: string
}

interface VoterStatus {
  isEligible: boolean
  hasVoted: boolean
  isLockedOut: boolean
  registrationStatus: 'pending' | 'verified' | 'rejected'
  lockoutReason?: string
  votingHistory?: Array<{
    electionId: string
    electionTitle: string
    votedAt: string
    transactionHash: string
  }>
}

class AuthService {
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
      const message =
        payload?.error?.message ||
        payload?.message ||
        `HTTP ${response.status}: ${response.statusText}`
      throw new Error(message)
    }
    return payload as T
  }

  private normalizeUser(userData: any): User {
    const now = new Date().toISOString()
    const role = userData?.role === 'admin' || userData?.role === 'creator' ? userData.role : 'voter'

    return {
      id: userData?.id || '',
      walletAddress: userData?.walletAddress || userData?.wallet_address || '',
      email: userData?.email || '',
      username: userData?.username || '',
      firstName: userData?.firstName || userData?.first_name || undefined,
      lastName: userData?.lastName || userData?.last_name || undefined,
      registrationNumber: userData?.registrationNumber || userData?.registration_number || undefined,
      role,
      isVerified: Boolean(userData?.isVerified ?? userData?.is_verified),
      createdAt: userData?.createdAt || userData?.created_at || now,
      updatedAt: userData?.updatedAt || userData?.updated_at || now,
    }
  }

  async register(data: RegistrationData): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/auth/register`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(data),
    })

    await this.handleResponse(response)
  }

  async verifyRegistration(_email: string, otp: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/auth/verify-email`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ token: otp }),
    })

    await this.handleResponse(response)
  }

  async resendVerification(email: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/auth/resend-verification`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ email }),
    })

    await this.handleResponse(response)
  }

  async requestOTP(identifier: LoginIdentifier): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/auth/login/initiate`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(identifier),
    })

    await this.handleResponse(response)
  }

  async verifyOTP(identifier: LoginIdentifier, otp: string): Promise<LoginResponse> {
    const response = await fetch(`${API_BASE_URL}/auth/login/complete`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({ ...identifier, otpToken: otp }),
    })

    const result = await this.handleResponse<any>(response)
    const apiUser = result?.data?.user
    const token = result?.data?.tokens?.accessToken

    if (!apiUser || !token) {
      throw new Error('Login response is missing user or access token')
    }

    localStorage.setItem('auth_token', token)
    return {
      user: this.normalizeUser(apiUser),
      token,
    }
  }

  async logout(): Promise<void> {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, {
        method: 'POST',
        headers: this.getAuthHeaders(),
      })
    } catch (error) {
      // Continue with logout even if API call fails
      console.warn('Logout API call failed:', error)
    } finally {
      localStorage.removeItem('auth_token')
    }
  }

  async getCurrentUser(): Promise<User> {
    const response = await fetch(`${API_BASE_URL}/users/profile`, {
      headers: this.getAuthHeaders(),
    })

    const result = await this.handleResponse<any>(response)
    return this.normalizeUser(result?.data?.user)
  }

  async updateProfile(data: Partial<User>): Promise<User> {
    const response = await fetch(`${API_BASE_URL}/users/profile`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(data),
    })

    const result = await this.handleResponse<any>(response)
    return this.normalizeUser(result?.data?.user)
  }

  async getVoterStatus(electionId?: string): Promise<VoterStatus> {
    if (electionId) {
      const response = await fetch(`${API_BASE_URL}/voting/status/${electionId}`, {
        headers: this.getAuthHeaders(),
      })

      const result = await this.handleResponse<any>(response)
      const userStatus = result?.data?.userStatus || {}

      return {
        isEligible: Boolean(userStatus.eligible),
        hasVoted: Boolean(userStatus.hasVoted),
        isLockedOut: false,
        registrationStatus: userStatus.eligible ? 'verified' : 'pending',
      }
    }

    const profile = await this.getCurrentUser()
    const isLockedOut = profile.role === 'voter' && (profile as any).voterStatus === 'locked_out'
    const hasVoted = (profile as any).voterStatus === 'voted'

    return {
      isEligible: profile.isVerified && !isLockedOut,
      hasVoted,
      isLockedOut,
      registrationStatus: profile.isVerified ? 'verified' : 'pending',
    }
  }

  async checkEligibility(electionId: string): Promise<{ eligible: boolean; reason?: string }> {
    const response = await fetch(`${API_BASE_URL}/voting/eligibility/${electionId}`, {
      headers: this.getAuthHeaders(),
    })

    const result = await this.handleResponse<any>(response)
    return {
      eligible: Boolean(result?.data?.isEligible ?? result?.data?.eligible),
      reason: result?.data?.reason,
    }
  }

  async lockVoterAccess(_electionId: string, _reason: string = 'Vote submitted successfully'): Promise<void> {
    // No backend endpoint currently exists for explicit lock-access in this build.
    return Promise.resolve()
  }

  async getVotingHistory(): Promise<Array<{
    electionId: string
    electionTitle: string
    votedAt: string
    transactionHash: string
  }>> {
    const response = await fetch(`${API_BASE_URL}/voting/history`, {
      headers: this.getAuthHeaders(),
    })

    const result = await this.handleResponse<any>(response)
    const votes = result?.data?.votes || []

    return votes.map((vote: any) => ({
      electionId: vote?.election?.id || '',
      electionTitle: vote?.election?.title || 'Election',
      votedAt: vote?.votedAt || vote?.voted_at || vote?.timestamp || '',
      transactionHash: vote?.transactionHash || vote?.transaction_hash || '',
    }))
  }

  getStoredToken(): string | null {
    return localStorage.getItem('auth_token')
  }

  isTokenValid(): boolean {
    const token = this.getStoredToken()
    if (!token) return false

    try {
      const payload = JSON.parse(atob(token.split('.')[1]))
      return payload.exp * 1000 > Date.now()
    } catch {
      return false
    }
  }
}

export const authService = new AuthService()
export type { LoginIdentifier, LoginResponse, RegistrationData, VoterStatus }
