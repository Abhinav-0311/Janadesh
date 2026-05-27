import { EventEmitter } from 'events';
import { Web3Provider } from './Web3Provider';
import { ContractService } from './ContractService';
import { TransactionService } from './TransactionService';
import { EventListenerService } from './EventListenerService';
import { 
  ElectionData, 
  CandidateData, 
  VoteData, 
  TransactionResult, 
  BlockchainEvent,
  GasEstimation 
} from './types';
import logger from '../../utils/logger';
import config from '../../config';

export class BlockchainService extends EventEmitter {
  private static instance: BlockchainService;
  private web3Provider: Web3Provider;
  private contractService: ContractService;
  private transactionService: TransactionService;
  private eventListenerService: EventListenerService;
  private isInitialized = false;
  private healthCheckInterval?: NodeJS.Timeout;

  private constructor() {
    super();
    this.web3Provider = Web3Provider.getInstance();
    this.contractService = new ContractService();
    this.transactionService = new TransactionService(this.contractService);
    this.eventListenerService = new EventListenerService(this.contractService);
    
    this.setupEventHandlers();
  }

  public static getInstance(): BlockchainService {
    if (!BlockchainService.instance) {
      BlockchainService.instance = new BlockchainService();
    }
    return BlockchainService.instance;
  }

  private setupEventHandlers(): void {
    // Forward blockchain events
    this.eventListenerService.on('event', (event: BlockchainEvent) => {
      this.emit('blockchainEvent', event);
    });

    // Handle specific events
    this.eventListenerService.on('CollegeVoting:VoteCast', (event: BlockchainEvent) => {
      this.emit('voteCast', event);
    });

    this.eventListenerService.on('CollegeVoting:ElectionCreated', (event: BlockchainEvent) => {
      this.emit('electionCreated', event);
    });

    this.eventListenerService.on('ElectionFactory:ElectionDeployed', (event: BlockchainEvent) => {
      this.emit('electionDeployed', event);
    });

    // Handle connection issues
    this.eventListenerService.on('error', (error) => {
      this.emit('error', error);
    });

    this.eventListenerService.on('reconnected', () => {
      this.emit('reconnected');
    });
  }

  public async initialize(): Promise<void> {
    if (this.isInitialized) {
      logger.warn('Blockchain service is already initialized');
      return;
    }

    try {
      logger.info('Initializing blockchain service...');

      // Verify network connection
      const isConnected = await this.web3Provider.verifyConnection();
      if (!isConnected) {
        throw new Error('Failed to connect to blockchain network');
      }

      // Verify contract connections
      const contracts = this.contractService.getAvailableContracts();
      for (const contractName of contracts) {
        const isVerified = await this.contractService.verifyContractConnection(contractName);
        if (!isVerified) {
          logger.warn(`Contract ${contractName} verification failed`);
        }
      }

      // Start event listener
      await this.eventListenerService.startListening();

      // Start health check
      this.startHealthCheck();

      this.isInitialized = true;
      logger.info('Blockchain service initialized successfully');
      this.emit('initialized');

    } catch (error) {
      logger.error('Failed to initialize blockchain service:', error);
      throw error;
    }
  }

  public async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      return;
    }

    logger.info('Shutting down blockchain service...');

    // Stop health check
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    // Stop event listener
    await this.eventListenerService.stopListening();

    this.isInitialized = false;
    logger.info('Blockchain service shut down');
    this.emit('shutdown');
  }

  // Election Management Methods
  public async createElection(
    title: string,
    description: string,
    startTime: number,
    endTime: number,
    electionType: number = 0,
    isPublic: boolean = true,
    maxChoices: number = 1
  ): Promise<TransactionResult> {
    try {
      logger.info(`Creating election: ${title}`);
      
      const result = await this.transactionService.executeTransaction(
        'CollegeVoting',
        'createElection',
        [title, description, startTime, endTime, electionType, isPublic, maxChoices]
      );

      if (result.success) {
        logger.info(`Election created successfully: ${title}`);
      }

      return result;
    } catch (error) {
      logger.error(`Failed to create election ${title}:`, error);
      throw error;
    }
  }

  public async getElection(electionId: number): Promise<ElectionData> {
    try {
      const electionData = await this.contractService.readMethod(
        'CollegeVoting',
        'getElectionDetails',
        [electionId]
      );

      return {
        id: electionId,
        title: electionData.title,
        description: electionData.description,
        startTime: Number(electionData.startTime),
        endTime: Number(electionData.endTime),
        electionType: Number(electionData.electionType),
        status: Number(electionData.status),
        creator: electionData.creator,
        isPublic: electionData.isPublic,
        totalVotes: Number(electionData.totalVotes),
        candidateCount: Number(electionData.candidateCount),
      };
    } catch (error) {
      logger.error(`Failed to get election ${electionId}:`, error);
      throw error;
    }
  }

  public async getElectionCount(): Promise<number> {
    try {
      const count = await this.contractService.readMethod('CollegeVoting', 'electionCount');
      return Number(count);
    } catch (error) {
      logger.error('Failed to get election count:', error);
      throw error;
    }
  }

  public async toggleElection(electionId: number, active: boolean): Promise<TransactionResult> {
    try {
      logger.info(`Toggling election ${electionId} to ${active ? 'active' : 'inactive'}`);
      
      return await this.transactionService.executeTransaction(
        'CollegeVoting',
        'toggleElection',
        [electionId, active]
      );
    } catch (error) {
      logger.error(`Failed to toggle election ${electionId}:`, error);
      throw error;
    }
  }

  // Candidate Management Methods
  public async addCandidate(
    electionId: number,
    candidateId: number,
    name: string,
    description: string,
    imageUrl: string
  ): Promise<TransactionResult> {
    try {
      logger.info(`Adding candidate ${name} to election ${electionId}`);
      
      return await this.transactionService.executeTransaction(
        'CollegeVoting',
        'updateCandidate',
        [electionId, candidateId, name, description, imageUrl]
      );
    } catch (error) {
      logger.error(`Failed to add candidate ${name}:`, error);
      throw error;
    }
  }

  public async getCandidate(electionId: number, candidateId: number): Promise<CandidateData> {
    try {
      const candidateData = await this.contractService.readMethod(
        'CollegeVoting',
        'getCandidateDetails',
        [electionId, candidateId]
      );

      return {
        id: candidateId,
        name: candidateData.name,
        description: candidateData.description,
        imageUrl: candidateData.imageUrl,
        voteCount: Number(candidateData.voteCount),
        isActive: candidateData.isActive,
      };
    } catch (error) {
      logger.error(`Failed to get candidate ${candidateId} from election ${electionId}:`, error);
      throw error;
    }
  }

  public async getCandidateVotes(electionId: number, candidateId: number): Promise<number> {
    try {
      const votes = await this.contractService.readMethod(
        'CollegeVoting',
        'getVotes',
        [electionId, candidateId]
      );
      return Number(votes);
    } catch (error) {
      logger.error(`Failed to get votes for candidate ${candidateId}:`, error);
      throw error;
    }
  }

  // Voting Methods
  public async castVote(electionId: number, candidateIds: number[]): Promise<TransactionResult> {
    try {
      logger.info(`Casting vote in election ${electionId} for candidates: ${candidateIds.join(', ')}`);
      
      return await this.transactionService.executeTransaction(
        'CollegeVoting',
        'castVote',
        [electionId, candidateIds]
      );
    } catch (error) {
      logger.error(`Failed to cast vote in election ${electionId}:`, error);
      throw error;
    }
  }

  public async hasVoted(electionId: number, voterAddress: string): Promise<boolean> {
    try {
      const hasVoted = await this.contractService.readMethod(
        'CollegeVoting',
        'hasVoted',
        [electionId, voterAddress]
      );
      return Boolean(hasVoted);
    } catch (error) {
      logger.error(`Failed to check if ${voterAddress} has voted:`, error);
      throw error;
    }
  }

  public async registerVoter(electionId: number, voterAddress: string): Promise<TransactionResult> {
    try {
      logger.info(`Registering voter ${voterAddress} for election ${electionId}`);
      
      return await this.transactionService.executeTransaction(
        'CollegeVoting',
        'registerVoter',
        [electionId, voterAddress]
      );
    } catch (error) {
      logger.error(`Failed to register voter ${voterAddress}:`, error);
      throw error;
    }
  }

  public async batchRegisterVoters(
    electionId: number, 
    voterAddresses: string[]
  ): Promise<TransactionResult> {
    try {
      logger.info(`Batch registering ${voterAddresses.length} voters for election ${electionId}`);
      
      return await this.transactionService.executeTransaction(
        'CollegeVoting',
        'batchRegisterVoters',
        [electionId, voterAddresses]
      );
    } catch (error) {
      logger.error(`Failed to batch register voters:`, error);
      throw error;
    }
  }

  // Factory Contract Methods
  public async deployElection(title: string, category: string): Promise<TransactionResult> {
    try {
      logger.info(`Deploying new election: ${title} (${category})`);
      
      return await this.transactionService.executeTransaction(
        'ElectionFactory',
        'deployElection',
        [title, category]
      );
    } catch (error) {
      logger.error(`Failed to deploy election ${title}:`, error);
      throw error;
    }
  }

  public async getDeployedElections(offset: number = 0, limit: number = 10): Promise<{
    elections: string[];
    total: number;
  }> {
    try {
      const result = await this.contractService.readMethod(
        'ElectionFactory',
        'getDeployedElections',
        [offset, limit]
      );
      
      return {
        elections: result.elections,
        total: Number(result.total),
      };
    } catch (error) {
      logger.error('Failed to get deployed elections:', error);
      throw error;
    }
  }

  // Gas and Transaction Methods
  public async estimateGas(
    contractName: string,
    methodName: string,
    args: any[] = []
  ): Promise<GasEstimation> {
    return this.transactionService.estimateTransactionCost(contractName, methodName, args);
  }

  public async getTransactionStatus(transactionId: string): Promise<TransactionResult | null> {
    return this.transactionService.getTransactionStatus(transactionId);
  }

  public async waitForTransaction(txHash: string, confirmations: number = 1): Promise<any> {
    return this.transactionService.waitForConfirmation(txHash, confirmations);
  }

  // Event Methods
  public async getHistoricalEvents(
    contractName: string,
    eventName: string,
    fromBlock: number | string = 'earliest',
    toBlock: number | string = 'latest'
  ): Promise<BlockchainEvent[]> {
    return this.eventListenerService.getHistoricalEvents(
      contractName,
      eventName,
      fromBlock,
      toBlock
    );
  }

  public async getVotingEvents(electionId?: number): Promise<BlockchainEvent[]> {
    const events = await this.getHistoricalEvents('CollegeVoting', 'VoteCast');
    
    if (electionId !== undefined) {
      return events.filter(event => Number(event.args.electionId) === electionId);
    }
    
    return events;
  }

  // Health and Status Methods
  public async getHealthStatus(): Promise<{
    isConnected: boolean;
    networkInfo: any;
    contractsStatus: Record<string, boolean>;
    eventListenerActive: boolean;
    lastProcessedBlock: number;
  }> {
    try {
      const isConnected = await this.web3Provider.verifyConnection();
      const networkInfo = await this.web3Provider.getNetworkInfo();
      
      const contracts = this.contractService.getAvailableContracts();
      const contractsStatus: Record<string, boolean> = {};
      
      for (const contractName of contracts) {
        contractsStatus[contractName] = await this.contractService.verifyContractConnection(contractName);
      }
      
      return {
        isConnected,
        networkInfo,
        contractsStatus,
        eventListenerActive: this.eventListenerService.isEventListenerActive(),
        lastProcessedBlock: this.eventListenerService.getLastProcessedBlock(),
      };
    } catch (error) {
      logger.error('Failed to get health status:', error);
      throw error;
    }
  }

  private startHealthCheck(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        const health = await this.getHealthStatus();
        
        if (!health.isConnected) {
          logger.warn('Blockchain connection lost');
          this.emit('connectionLost');
        }
        
        // Check if event listener is still active
        if (!health.eventListenerActive && this.isInitialized) {
          logger.warn('Event listener is not active, attempting to restart');
          try {
            await this.eventListenerService.startListening();
          } catch (error) {
            logger.error('Failed to restart event listener:', error);
          }
        }
        
      } catch (error) {
        logger.error('Health check failed:', error);
      }
    }, 30000); // Check every 30 seconds
  }

  // Utility Methods
  public getCurrentNetwork(): string {
    return this.web3Provider.getCurrentNetwork();
  }

  public async switchNetwork(networkName: string): Promise<void> {
    await this.web3Provider.switchNetwork(networkName);
    
    // Restart event listener on new network
    if (this.eventListenerService.isEventListenerActive()) {
      await this.eventListenerService.stopListening();
      await this.eventListenerService.startListening();
    }
  }

  public getAvailableNetworks(): string[] {
    return this.web3Provider.getAvailableNetworks();
  }

  public formatEther(value: bigint): string {
    return this.web3Provider.formatEther(value);
  }

  public parseEther(value: string): bigint {
    return this.web3Provider.parseEther(value);
  }

  public getInitializationStatus(): boolean {
    return this.isInitialized;
  }
}