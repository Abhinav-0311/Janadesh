/**
 * Example usage of the Blockchain Integration Service
 * This file demonstrates how to use the blockchain service in your application
 */

import { BlockchainService } from '../services/blockchain';
import logger from '../utils/logger';

export class BlockchainUsageExample {
  private blockchainService: BlockchainService;

  constructor() {
    this.blockchainService = BlockchainService.getInstance();
  }

  /**
   * Initialize the blockchain service
   */
  async initialize(): Promise<void> {
    try {
      logger.info('Initializing blockchain service...');
      await this.blockchainService.initialize();
      logger.info('Blockchain service initialized successfully');

      // Set up event listeners
      this.setupEventListeners();
    } catch (error) {
      logger.error('Failed to initialize blockchain service:', error);
      throw error;
    }
  }

  /**
   * Set up event listeners for blockchain events
   */
  private setupEventListeners(): void {
    // Listen for vote cast events
    this.blockchainService.on('voteCast', (event) => {
      logger.info(`Vote cast in election ${event.args.electionId} by ${event.args.voter}`);
      // Handle vote cast event (e.g., update database, notify users)
    });

    // Listen for new elections
    this.blockchainService.on('electionCreated', (event) => {
      logger.info(`New election created: ${event.args.name} (ID: ${event.args.electionId})`);
      // Handle new election event (e.g., update database, notify users)
    });

    // Listen for connection issues
    this.blockchainService.on('connectionLost', () => {
      logger.warn('Blockchain connection lost, attempting to reconnect...');
      // Handle connection loss (e.g., notify admin, retry operations)
    });

    // Listen for reconnection
    this.blockchainService.on('reconnected', () => {
      logger.info('Blockchain connection restored');
      // Handle reconnection (e.g., sync missed events)
    });
  }

  /**
   * Example: Create a new election
   */
  async createElection(
    title: string,
    description: string,
    startTime: number,
    endTime: number
  ): Promise<string> {
    try {
      logger.info(`Creating election: ${title}`);

      const result = await this.blockchainService.createElection(
        title,
        description,
        startTime,
        endTime,
        0, // Single choice election
        true, // Public election
        1 // Max 1 choice
      );

      if (result.success) {
        logger.info(`Election created successfully. Transaction: ${result.hash}`);
        return result.hash;
      } else {
        throw new Error(result.error || 'Failed to create election');
      }
    } catch (error) {
      logger.error(`Failed to create election ${title}:`, error);
      throw error;
    }
  }

  /**
   * Example: Cast a vote
   */
  async castVote(electionId: number, candidateIds: number[]): Promise<string> {
    try {
      logger.info(`Casting vote in election ${electionId} for candidates: ${candidateIds.join(', ')}`);

      const result = await this.blockchainService.castVote(electionId, candidateIds);

      if (result.success) {
        logger.info(`Vote cast successfully. Transaction: ${result.hash}`);
        return result.hash;
      } else {
        throw new Error(result.error || 'Failed to cast vote');
      }
    } catch (error) {
      logger.error(`Failed to cast vote in election ${electionId}:`, error);
      throw error;
    }
  }

  /**
   * Example: Get election details
   */
  async getElectionDetails(electionId: number): Promise<any> {
    try {
      logger.info(`Getting details for election ${electionId}`);

      const election = await this.blockchainService.getElection(electionId);
      
      logger.info(`Retrieved election: ${election.title}`);
      return election;
    } catch (error) {
      logger.error(`Failed to get election ${electionId}:`, error);
      throw error;
    }
  }

  /**
   * Example: Check if user has voted
   */
  async hasUserVoted(electionId: number, voterAddress: string): Promise<boolean> {
    try {
      const hasVoted = await this.blockchainService.hasVoted(electionId, voterAddress);
      logger.info(`User ${voterAddress} has ${hasVoted ? 'already' : 'not'} voted in election ${electionId}`);
      return hasVoted;
    } catch (error) {
      logger.error(`Failed to check voting status for ${voterAddress}:`, error);
      throw error;
    }
  }

  /**
   * Example: Get voting history
   */
  async getVotingHistory(electionId?: number): Promise<any[]> {
    try {
      logger.info(`Getting voting history${electionId ? ` for election ${electionId}` : ''}`);

      const events = await this.blockchainService.getVotingEvents(electionId);
      
      logger.info(`Retrieved ${events.length} voting events`);
      return events;
    } catch (error) {
      logger.error('Failed to get voting history:', error);
      throw error;
    }
  }

  /**
   * Example: Estimate gas for a transaction
   */
  async estimateVotingGas(electionId: number, candidateIds: number[]): Promise<any> {
    try {
      const gasEstimation = await this.blockchainService.estimateGas(
        'CollegeVoting',
        'castVote',
        [electionId, candidateIds]
      );

      logger.info(`Gas estimation for voting: ${gasEstimation.gasLimit} gas, ${gasEstimation.estimatedCost} wei`);
      return gasEstimation;
    } catch (error) {
      logger.error('Failed to estimate gas:', error);
      throw error;
    }
  }

  /**
   * Example: Get service health status
   */
  async getHealthStatus(): Promise<any> {
    try {
      const health = await this.blockchainService.getHealthStatus();
      
      logger.info(`Blockchain service health: ${health.isConnected ? 'Connected' : 'Disconnected'}`);
      logger.info(`Network: ${health.networkInfo.name} (Chain ID: ${health.networkInfo.chainId})`);
      logger.info(`Event listener: ${health.eventListenerActive ? 'Active' : 'Inactive'}`);
      
      return health;
    } catch (error) {
      logger.error('Failed to get health status:', error);
      throw error;
    }
  }

  /**
   * Shutdown the blockchain service
   */
  async shutdown(): Promise<void> {
    try {
      logger.info('Shutting down blockchain service...');
      await this.blockchainService.shutdown();
      logger.info('Blockchain service shut down successfully');
    } catch (error) {
      logger.error('Failed to shutdown blockchain service:', error);
      throw error;
    }
  }
}

// Example usage in an Express route or service
export async function exampleUsage(): Promise<void> {
  const example = new BlockchainUsageExample();
  
  try {
    // Initialize the service
    await example.initialize();
    
    // Check health status
    await example.getHealthStatus();
    
    // Example operations (uncomment to test with actual blockchain)
    /*
    // Create an election
    const txHash = await example.createElection(
      'Student Council Election',
      'Annual student council election',
      Math.floor(Date.now() / 1000) + 3600, // Start in 1 hour
      Math.floor(Date.now() / 1000) + 86400  // End in 24 hours
    );
    
    // Get election details
    const election = await example.getElectionDetails(1);
    
    // Cast a vote (requires voter registration first)
    const voteHash = await example.castVote(1, [1]);
    
    // Check voting status
    const hasVoted = await example.hasUserVoted(1, '0x...');
    
    // Get voting history
    const history = await example.getVotingHistory(1);
    */
    
  } catch (error) {
    logger.error('Example usage failed:', error);
  } finally {
    // Always shutdown gracefully
    await example.shutdown();
  }
}

// Export for use in other parts of the application
export default BlockchainUsageExample;