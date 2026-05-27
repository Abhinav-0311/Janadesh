import { ethers } from 'ethers';
import { EventEmitter } from 'events';
import { Web3Provider } from './Web3Provider';
import { ContractService } from './ContractService';
import { BlockchainEvent, EventFilter } from './types';
import logger from '../../utils/logger';

export class EventListenerService extends EventEmitter {
  private web3Provider: Web3Provider;
  private contractService: ContractService;
  private activeListeners: Map<string, ethers.ContractEventName> = new Map();
  private eventFilters: Map<string, EventFilter> = new Map();
  private isListening = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 5000;
  private lastProcessedBlock = 0;

  constructor(contractService: ContractService) {
    super();
    this.web3Provider = Web3Provider.getInstance();
    this.contractService = contractService;
    this.setupErrorHandling();
  }

  private setupErrorHandling(): void {
    this.on('error', (error) => {
      logger.error('Event listener error:', error);
      this.handleConnectionError(error);
    });
  }

  public async startListening(): Promise<void> {
    if (this.isListening) {
      logger.warn('Event listener is already running');
      return;
    }

    try {
      this.isListening = true;
      this.reconnectAttempts = 0;
      
      // Get current block number
      const provider = this.web3Provider.getProvider();
      this.lastProcessedBlock = await provider.getBlockNumber();
      
      // Start listening to all configured events
      await this.setupEventListeners();
      
      logger.info(`Event listener started at block ${this.lastProcessedBlock}`);
      this.emit('listening', { blockNumber: this.lastProcessedBlock });
      
    } catch (error) {
      this.isListening = false;
      logger.error('Failed to start event listener:', error);
      throw error;
    }
  }

  public async stopListening(): Promise<void> {
    if (!this.isListening) {
      return;
    }

    this.isListening = false;
    
    // Remove all active listeners
    for (const [listenerId, listener] of this.activeListeners) {
      try {
        // Remove listener from contract
        const [contractName, eventName] = listenerId.split(':');
        const contract = this.contractService.getContract(contractName);
        contract.off(eventName, listener as any);
        
        logger.debug(`Removed listener for ${listenerId}`);
      } catch (error) {
        logger.error(`Failed to remove listener ${listenerId}:`, error);
      }
    }
    
    this.activeListeners.clear();
    logger.info('Event listener stopped');
    this.emit('stopped');
  }

  public async addEventListener(
    contractName: string,
    eventName: string,
    filter: EventFilter = {},
    callback?: (event: BlockchainEvent) => void
  ): Promise<string> {
    const listenerId = `${contractName}:${eventName}`;
    
    try {
      const contract = this.contractService.getContract(contractName);
      
      // Create event listener
      const listener = async (...args: any[]) => {
        try {
          const event = args[args.length - 1]; // Last argument is the event object
          const blockchainEvent = await this.processEvent(contractName, eventName, event);
          
          // Call custom callback if provided
          if (callback) {
            callback(blockchainEvent);
          }
          
          // Emit event for general listeners
          this.emit('event', blockchainEvent);
          this.emit(`${contractName}:${eventName}`, blockchainEvent);
          
        } catch (error) {
          logger.error(`Error processing event ${listenerId}:`, error);
          this.emit('error', error);
        }
      };
      
      // Add listener to contract
      contract.on(eventName, listener);
      
      // Store listener reference
      this.activeListeners.set(listenerId, listener as any);
      this.eventFilters.set(listenerId, filter);
      
      logger.info(`Added event listener for ${listenerId}`);
      return listenerId;
      
    } catch (error) {
      logger.error(`Failed to add event listener for ${listenerId}:`, error);
      throw error;
    }
  }

  public removeEventListener(listenerId: string): boolean {
    try {
      const listener = this.activeListeners.get(listenerId);
      if (!listener) {
        return false;
      }
      
      const [contractName, eventName] = listenerId.split(':');
      const contract = this.contractService.getContract(contractName);
      
      // Remove listener from contract
      contract.off(eventName, listener as any);
      
      // Clean up references
      this.activeListeners.delete(listenerId);
      this.eventFilters.delete(listenerId);
      
      logger.info(`Removed event listener for ${listenerId}`);
      return true;
      
    } catch (error) {
      logger.error(`Failed to remove event listener ${listenerId}:`, error);
      return false;
    }
  }

  public async getHistoricalEvents(
    contractName: string,
    eventName: string,
    fromBlock: number | string = 'earliest',
    toBlock: number | string = 'latest',
    additionalFilters: any = {}
  ): Promise<BlockchainEvent[]> {
    try {
      const events = await this.contractService.getContractEvents(
        contractName,
        eventName,
        fromBlock,
        toBlock,
        additionalFilters
      );
      
      const blockchainEvents: BlockchainEvent[] = [];
      
      for (const event of events) {
        const blockchainEvent = await this.processEvent(contractName, eventName, event);
        blockchainEvents.push(blockchainEvent);
      }
      
      logger.info(`Retrieved ${blockchainEvents.length} historical ${eventName} events from ${contractName}`);
      return blockchainEvents;
      
    } catch (error) {
      logger.error(`Failed to get historical events for ${contractName}:${eventName}:`, error);
      throw error;
    }
  }

  private async setupEventListeners(): Promise<void> {
    // Setup listeners for CollegeVoting contract events
    if (this.contractService.getAvailableContracts().includes('CollegeVoting')) {
      await this.setupVotingContractListeners();
    }
    
    // Setup listeners for ElectionFactory contract events
    if (this.contractService.getAvailableContracts().includes('ElectionFactory')) {
      await this.setupFactoryContractListeners();
    }
  }

  private async setupVotingContractListeners(): Promise<void> {
    const contractName = 'CollegeVoting';
    
    // Listen for VoteCast events
    await this.addEventListener(contractName, 'VoteCast', {}, (event) => {
      logger.info(`Vote cast in election ${event.args.electionId} by ${event.args.voter}`);
    });
    
    // Listen for ElectionCreated events
    await this.addEventListener(contractName, 'ElectionCreated', {}, (event) => {
      logger.info(`New election created: ${event.args.name} (ID: ${event.args.electionId})`);
    });
    
    // Listen for ElectionToggled events
    await this.addEventListener(contractName, 'ElectionToggled', {}, (event) => {
      logger.info(`Election ${event.args.electionId} toggled to ${event.args.active ? 'active' : 'inactive'}`);
    });
    
    // Listen for VoterRegistered events
    await this.addEventListener(contractName, 'VoterRegistered', {}, (event) => {
      logger.info(`Voter ${event.args.voter} registered for election ${event.args.electionId}`);
    });
  }

  private async setupFactoryContractListeners(): Promise<void> {
    const contractName = 'ElectionFactory';
    
    // Listen for ElectionDeployed events
    await this.addEventListener(contractName, 'ElectionDeployed', {}, (event) => {
      logger.info(`New election deployed: ${event.args.title} at ${event.args.electionContract}`);
    });
    
    // Listen for CreatorAuthorized events
    await this.addEventListener(contractName, 'CreatorAuthorized', {}, (event) => {
      logger.info(`Creator ${event.args.creator} authorized by ${event.args.authorizedBy}`);
    });
    
    // Listen for CreatorRevoked events
    await this.addEventListener(contractName, 'CreatorRevoked', {}, (event) => {
      logger.info(`Creator ${event.args.creator} revoked by ${event.args.revokedBy}`);
    });
  }

  private async processEvent(
    contractName: string,
    eventName: string,
    event: ethers.EventLog
  ): Promise<BlockchainEvent> {
    // Get block timestamp
    const provider = this.web3Provider.getProvider();
    const block = await provider.getBlock(event.blockNumber);
    
    const blockchainEvent: BlockchainEvent = {
      eventName,
      contractAddress: event.address,
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      args: event.args,
      timestamp: block?.timestamp || 0,
    };
    
    // Update last processed block
    if (event.blockNumber > this.lastProcessedBlock) {
      this.lastProcessedBlock = event.blockNumber;
    }
    
    return blockchainEvent;
  }

  private async handleConnectionError(error: any): Promise<void> {
    if (!this.isListening) {
      return;
    }
    
    logger.error(`Connection error in event listener (attempt ${this.reconnectAttempts + 1}):`, error);
    
    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      
      logger.info(`Attempting to reconnect event listener in ${this.reconnectDelay}ms...`);
      
      setTimeout(async () => {
        try {
          await this.reconnect();
        } catch (reconnectError) {
          logger.error('Failed to reconnect event listener:', reconnectError);
          this.handleConnectionError(reconnectError);
        }
      }, this.reconnectDelay);
      
      // Exponential backoff
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, 60000);
    } else {
      logger.error('Max reconnection attempts reached, stopping event listener');
      await this.stopListening();
      this.emit('maxReconnectAttemptsReached', error);
    }
  }

  private async reconnect(): Promise<void> {
    logger.info('Reconnecting event listener...');
    
    // Stop current listeners
    await this.stopListening();
    
    // Verify connection
    const isConnected = await this.web3Provider.verifyConnection();
    if (!isConnected) {
      throw new Error('Cannot reconnect: blockchain connection failed');
    }
    
    // Restart listening
    await this.startListening();
    
    this.reconnectAttempts = 0;
    this.reconnectDelay = 5000;
    
    logger.info('Event listener reconnected successfully');
    this.emit('reconnected');
  }

  public async syncMissedEvents(): Promise<void> {
    if (!this.isListening) {
      return;
    }
    
    try {
      const provider = this.web3Provider.getProvider();
      const currentBlock = await provider.getBlockNumber();
      
      if (currentBlock > this.lastProcessedBlock + 1) {
        logger.info(`Syncing missed events from block ${this.lastProcessedBlock + 1} to ${currentBlock}`);
        
        // Get missed events for each active listener
        for (const [listenerId] of this.activeListeners) {
          const [contractName, eventName] = listenerId.split(':');
          
          try {
            const missedEvents = await this.getHistoricalEvents(
              contractName,
              eventName,
              this.lastProcessedBlock + 1,
              currentBlock
            );
            
            // Emit missed events
            for (const event of missedEvents) {
              this.emit('event', event);
              this.emit(`${contractName}:${eventName}`, event);
            }
            
          } catch (error) {
            logger.error(`Failed to sync missed events for ${listenerId}:`, error);
          }
        }
        
        this.lastProcessedBlock = currentBlock;
        this.emit('syncCompleted', { fromBlock: this.lastProcessedBlock + 1, toBlock: currentBlock });
      }
      
    } catch (error) {
      logger.error('Failed to sync missed events:', error);
      this.emit('error', error);
    }
  }

  public getActiveListeners(): string[] {
    return Array.from(this.activeListeners.keys());
  }

  public getLastProcessedBlock(): number {
    return this.lastProcessedBlock;
  }

  public isEventListenerActive(): boolean {
    return this.isListening;
  }

  public async getEventCount(
    contractName: string,
    eventName: string,
    fromBlock: number | string = 'earliest',
    toBlock: number | string = 'latest'
  ): Promise<number> {
    try {
      const events = await this.getHistoricalEvents(contractName, eventName, fromBlock, toBlock);
      return events.length;
    } catch (error) {
      logger.error(`Failed to get event count for ${contractName}:${eventName}:`, error);
      return 0;
    }
  }
}