// Export all repositories
export { BaseRepository } from './BaseRepository';
export { UserRepository } from './UserRepository';
export { ElectionRepository } from './ElectionRepository';
export { CandidateRepository } from './CandidateRepository';
export { VoteCacheRepository } from './VoteCacheRepository';
export { VoterRegistrationRepository } from './VoterRegistrationRepository';
export { VoterEligibilityRepository } from './VoterEligibilityRepository';
export { OtpTokenRepository } from './OtpTokenRepository';

// Export repository instances
import userRepository from './UserRepository';
import electionRepository from './ElectionRepository';
import candidateRepository from './CandidateRepository';
import voteCacheRepository from './VoteCacheRepository';
import voterRegistrationRepository from './VoterRegistrationRepository';
import voterEligibilityRepository from './VoterEligibilityRepository';
import otpTokenRepository from './OtpTokenRepository';

export {
  userRepository,
  electionRepository,
  candidateRepository,
  voteCacheRepository,
  voterRegistrationRepository,
  voterEligibilityRepository,
  otpTokenRepository
};

// Repository collection for easy access
export const repositories = {
  user: userRepository,
  election: electionRepository,
  candidate: candidateRepository,
  voteCache: voteCacheRepository,
  voterRegistration: voterRegistrationRepository,
  voterEligibility: voterEligibilityRepository,
  otpToken: otpTokenRepository
};

export default repositories;