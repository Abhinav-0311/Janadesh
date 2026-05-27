import { Election, ElectionForm, Candidate, ApiResponse, FilterParams, PaginationParams } from '../../types'

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || '/api/v1'

const mapElectionTypeToApi = (type?: Election['electionType']): 'single_choice' | 'multiple_choice' | 'ranked_voting' => {
  switch (type) {
    case 'multiple':
      return 'multiple_choice'
    case 'ranked':
      return 'ranked_voting'
    default:
      return 'single_choice'
  }
}

const mapElectionTypeFromApi = (type?: string): Election['electionType'] => {
  switch (type) {
    case 'multiple_choice':
    case 'multiple':
      return 'multiple'
    case 'ranked_voting':
    case 'ranked':
      return 'ranked'
    default:
      return 'single'
  }
}

class ElectionsApiService {
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

  private mapCandidate(candidate: any, electionId: string = ''): Candidate {
    return {
      id: candidate?.id || '',
      electionId: candidate?.electionId || candidate?.election_id || electionId,
      name: candidate?.name || '',
      description: candidate?.description || '',
      imageUrl: candidate?.imageUrl || candidate?.image_url || '',
      position: candidate?.position ?? 0,
      voteCount: candidate?.voteCount ?? candidate?.vote_count ?? 0,
    }
  }

  private mapElection(record: any, candidatesFromResponse?: any[]): Election {
    const electionId = record?.id || ''
    const candidateSource = candidatesFromResponse || record?.candidates || []
    const candidates = Array.isArray(candidateSource)
      ? candidateSource.map((candidate: any) => this.mapCandidate(candidate, electionId))
      : []

    const totalVotes =
      record?.totalVotes ??
      record?.totalVotesCast ??
      record?.total_votes_cast ??
      record?.total_votes ??
      candidates.reduce((sum, candidate) => sum + (candidate.voteCount || 0), 0)

    return {
      id: electionId,
      contractAddress: record?.contractAddress || record?.contract_address || '',
      title: record?.title || '',
      description: record?.description || '',
      creatorId: record?.creatorId || record?.creator_id || '',
      electionType: mapElectionTypeFromApi(record?.electionType || record?.election_type),
      startTime: record?.startTime || record?.start_time || new Date().toISOString(),
      endTime: record?.endTime || record?.end_time || new Date().toISOString(),
      isPublic: Boolean(record?.isPublic ?? record?.is_public ?? true),
      status: record?.status || 'pending',
      candidates,
      totalVotes,
      createdAt: record?.createdAt || record?.created_at || new Date().toISOString(),
      updatedAt: record?.updatedAt || record?.updated_at || new Date().toISOString(),
    }
  }

  async getElections(filters?: FilterParams, pagination?: PaginationParams): Promise<Election[]> {
    const params = new URLSearchParams()

    if (filters?.status && filters.status !== 'all') {
      params.append('status', filters.status)
    }
    if (filters?.search) {
      params.append('search', filters.search)
    }
    if (filters?.electionType && filters.electionType !== 'all') {
      params.append('type', mapElectionTypeToApi(filters.electionType as Election['electionType']))
    }

    if (pagination?.page) {
      params.append('page', pagination.page.toString())
    }
    if (pagination?.limit) {
      params.append('limit', pagination.limit.toString())
    }

    const queryString = params.toString()
    const response = await fetch(`${API_BASE_URL}/elections${queryString ? `?${queryString}` : ''}`, {
      headers: this.getAuthHeaders(),
    })

    const result = await this.handleResponse<ApiResponse<any>>(response)
    const elections = result?.data?.elections || result?.data || []
    if (!Array.isArray(elections)) {
      return []
    }

    return elections.map((election: any) => this.mapElection(election))
  }

  async getElection(id: string): Promise<Election> {
    const response = await fetch(`${API_BASE_URL}/elections/${id}`, {
      headers: this.getAuthHeaders(),
    })

    const result = await this.handleResponse<ApiResponse<any>>(response)
    const election = result?.data?.election || result?.data
    const candidates = result?.data?.candidates || election?.candidates || []

    if (!election) {
      throw new Error('Election not found')
    }

    return this.mapElection(election, candidates)
  }

  async createElection(electionData: ElectionForm): Promise<Election> {
    const maxVotesPerVoter =
      electionData.electionType === 'single'
        ? 1
        : Math.max(2, Math.min(electionData.candidates.length, 5))

    const payload = {
      title: electionData.title,
      description: electionData.description,
      electionType: mapElectionTypeToApi(electionData.electionType),
      startTime: electionData.startTime,
      endTime: electionData.endTime,
      isPublic: electionData.isPublic,
      maxVotesPerVoter,
      requiresRegistration: false,
      candidates: electionData.candidates.map(candidate => ({
        name: candidate.name,
        description: candidate.description,
        imageUrl: candidate.imageUrl,
      })),
    }

    const response = await fetch(`${API_BASE_URL}/elections`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload),
    })

    const result = await this.handleResponse<ApiResponse<any>>(response)
    const election = result?.data?.election || result?.data
    const candidates = result?.data?.candidates || election?.candidates || []

    if (!election) {
      throw new Error('Failed to create election')
    }

    return this.mapElection(election, candidates)
  }

  async updateElection(id: string, electionData: Partial<ElectionForm>): Promise<Election> {
    const payload: Record<string, unknown> = {}
    if (electionData.title !== undefined) payload.title = electionData.title
    if (electionData.description !== undefined) payload.description = electionData.description
    if (electionData.startTime !== undefined) payload.startTime = electionData.startTime
    if (electionData.endTime !== undefined) payload.endTime = electionData.endTime
    if (electionData.isPublic !== undefined) payload.isPublic = electionData.isPublic
    if (electionData.electionType !== undefined) {
      payload.electionType = mapElectionTypeToApi(electionData.electionType)
    }

    const response = await fetch(`${API_BASE_URL}/elections/${id}`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify(payload),
    })

    const result = await this.handleResponse<ApiResponse<any>>(response)
    const election = result?.data?.election || result?.data
    const candidates = result?.data?.candidates || election?.candidates || []

    if (!election) {
      throw new Error('Failed to update election')
    }

    return this.mapElection(election, candidates)
  }

  async deleteElection(id: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/elections/${id}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    })

    await this.handleResponse<ApiResponse>(response)
  }

  async addCandidate(electionId: string, candidateData: Omit<Candidate, 'id' | 'electionId' | 'voteCount'>): Promise<Candidate> {
    const response = await fetch(`${API_BASE_URL}/elections/${electionId}/candidates`, {
      method: 'POST',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({
        name: candidateData.name,
        description: candidateData.description,
        imageUrl: candidateData.imageUrl,
      }),
    })

    const result = await this.handleResponse<ApiResponse<any>>(response)
    const candidate = result?.data?.candidate || result?.data
    if (!candidate) {
      throw new Error('Failed to add candidate')
    }
    return this.mapCandidate(candidate, electionId)
  }

  async updateCandidate(electionId: string, candidateId: string, candidateData: Partial<Candidate>): Promise<Candidate> {
    const response = await fetch(`${API_BASE_URL}/elections/${electionId}/candidates/${candidateId}`, {
      method: 'PUT',
      headers: this.getAuthHeaders(),
      body: JSON.stringify({
        name: candidateData.name,
        description: candidateData.description,
        imageUrl: candidateData.imageUrl,
      }),
    })

    const result = await this.handleResponse<ApiResponse<any>>(response)
    const candidate = result?.data?.candidate || result?.data
    if (!candidate) {
      throw new Error('Failed to update candidate')
    }
    return this.mapCandidate(candidate, electionId)
  }

  async deleteCandidate(electionId: string, candidateId: string): Promise<void> {
    const response = await fetch(`${API_BASE_URL}/elections/${electionId}/candidates/${candidateId}`, {
      method: 'DELETE',
      headers: this.getAuthHeaders(),
    })

    await this.handleResponse<ApiResponse>(response)
  }

  async getElectionResults(id: string): Promise<{ candidates: Candidate[]; totalVotes: number }> {
    const response = await fetch(`${API_BASE_URL}/elections/${id}/results`, {
      headers: this.getAuthHeaders(),
    })

    const result = await this.handleResponse<ApiResponse<any>>(response)
    const data = result?.data || {}

    const rawCandidates: any[] = Array.isArray(data.candidates)
      ? data.candidates
      : Array.isArray(data.results)
        ? data.results.map((entry: any) => ({
            ...(entry?.candidate || {}),
            vote_count: entry?.voteCount ?? 0,
          }))
        : []

    const candidates = rawCandidates.map(candidate => this.mapCandidate(candidate, candidate?.election_id))

    const totalVotes =
      data?.election?.totalVotesCast ??
      data?.election?.total_votes_cast ??
      candidates.reduce((sum, candidate) => sum + (candidate.voteCount || 0), 0)

    return { candidates, totalVotes }
  }
}

export const electionsApi = new ElectionsApiService()
