import { ethers } from 'ethers';
import config from '../../config';
import logger from '../../utils/logger';
import { NetworkConfig, RetryConfig } from './types';

export class Web3Provider {
  private static instance: Web3Provider;
  private providers: Map<string, ethers.JsonRpcProvider> = new Map();
  private signers: Map<string, ethers.Wallet> = new Map();
  private currentNetwork: string;
  private retryConfig: RetryConfig;

  private constructor() {
    this.currentNetwork = config.blockchain.network;
    this.retryConfig = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
    };
    this.initializeProviders();
  }

  public static getInstance(): Web3Provider {
    if (!Web3Provider.instance) {
      Web3Provider.instance = new Web3Provider();
    }
    return Web3Provider.instance;
  }

  private initializeProviders(): void {
    const networks: NetworkConfig[] = [
      {
        name: 'localhost',
        rpcUrl: 'http://127.0.0.1:8545',
        chainId: 31337,
        gasPrice: '20000000000', // 20 gwei
        gasLimit: 6000000,
      },
      {
        name: 'hardhat',
        rpcUrl: 'http://127.0.0.1:8545',
        chainId: 31337,
        gasPrice: '20000000000',
        gasLimit: 6000000,
      },
      {
        name: 'sepolia',
        rpcUrl: process.env.SEPOLIA_RPC_URL || 'https://sepolia.infura.io/v3/YOUR_PROJECT_ID',
        chainId: 11155111,
        gasPrice: '30000000000', // 30 gwei
        gasLimit: 3000000,
      },
      {
        name: 'mainnet',
        rpcUrl: process.env.MAINNET_RPC_URL || 'https://mainnet.infura.io/v3/YOUR_PROJECT_ID',
        chainId: 1,
        gasPrice: '50000000000', // 50 gwei
        gasLimit: 3000000,
      },
    ];

    // Initialize providers for all networks
    networks.forEach((network) => {
      try {
        const provider = new ethers.JsonRpcProvider(network.rpcUrl);
        this.providers.set(network.name, provider);

        // Initialize signer if private key is available
        if (config.blockchain.privateKey) {
          const signer = new ethers.Wallet(config.blockchain.privateKey, provider);
          this.signers.set(network.name, signer);
        }

        logger.info(`Initialized provider for network: ${network.name}`);
      } catch (error) {
        logger.error(`Failed to initialize provider for ${network.name}:`, error);
      }
    });

    // Set current network from config
    if (config.blockchain.rpcUrl && config.blockchain.network) {
      try {
        const customProvider = new ethers.JsonRpcProvider(config.blockchain.rpcUrl);
        this.providers.set(config.blockchain.network, customProvider);

        if (config.blockchain.privateKey) {
          const customSigner = new ethers.Wallet(config.blockchain.privateKey, customProvider);
          this.signers.set(config.blockchain.network, customSigner);
        }

        this.currentNetwork = config.blockchain.network;
        logger.info(`Set current network to: ${this.currentNetwork}`);
      } catch (error) {
        logger.error(`Failed to initialize custom network ${config.blockchain.network}:`, error);
      }
    }
  }

  public getProvider(network?: string): ethers.JsonRpcProvider {
    const networkName = network || this.currentNetwork;
    const provider = this.providers.get(networkName);
    
    if (!provider) {
      throw new Error(`Provider not found for network: ${networkName}`);
    }
    
    return provider;
  }

  public getSigner(network?: string): ethers.Wallet {
    const networkName = network || this.currentNetwork;
    const signer = this.signers.get(networkName);
    
    if (!signer) {
      throw new Error(`Signer not found for network: ${networkName}. Make sure PRIVATE_KEY is set.`);
    }
    
    return signer;
  }

  public async switchNetwork(networkName: string): Promise<void> {
    if (!this.providers.has(networkName)) {
      throw new Error(`Network ${networkName} is not configured`);
    }

    this.currentNetwork = networkName;
    logger.info(`Switched to network: ${networkName}`);

    // Verify connection
    await this.verifyConnection(networkName);
  }

  public getCurrentNetwork(): string {
    return this.currentNetwork;
  }

  public getAvailableNetworks(): string[] {
    return Array.from(this.providers.keys());
  }

  public async verifyConnection(network?: string): Promise<boolean> {
    try {
      const provider = this.getProvider(network);
      const blockNumber = await provider.getBlockNumber();
      const networkInfo = await provider.getNetwork();
      
      logger.info(`Connected to network ${network || this.currentNetwork}: Block ${blockNumber}, Chain ID ${networkInfo.chainId}`);
      return true;
    } catch (error) {
      logger.error(`Failed to verify connection to ${network || this.currentNetwork}:`, error);
      return false;
    }
  }

  public async getNetworkInfo(network?: string): Promise<{
    name: string;
    chainId: bigint;
    blockNumber: number;
    gasPrice: bigint;
  }> {
    const provider = this.getProvider(network);
    const networkInfo = await provider.getNetwork();
    const blockNumber = await provider.getBlockNumber();
    const feeData = await provider.getFeeData();

    return {
      name: network || this.currentNetwork,
      chainId: networkInfo.chainId,
      blockNumber,
      gasPrice: feeData.gasPrice || BigInt(0),
    };
  }

  public async executeWithRetry<T>(
    operation: () => Promise<T>,
    context: string = 'blockchain operation'
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        
        if (attempt === this.retryConfig.maxRetries) {
          logger.error(`${context} failed after ${attempt} attempts:`, error);
          throw error;
        }

        const delay = Math.min(
          this.retryConfig.baseDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt - 1),
          this.retryConfig.maxDelay
        );

        logger.warn(`${context} failed (attempt ${attempt}/${this.retryConfig.maxRetries}), retrying in ${delay}ms:`, error);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    throw lastError!;
  }

  public async waitForTransaction(
    txHash: string,
    confirmations: number = 1,
    timeout: number = 60000,
    network?: string
  ): Promise<ethers.TransactionReceipt> {
    const provider = this.getProvider(network);
    
    return this.executeWithRetry(async () => {
      const receipt = await provider.waitForTransaction(txHash, confirmations, timeout);
      if (!receipt) {
        throw new Error(`Transaction ${txHash} was not mined within timeout`);
      }
      return receipt;
    }, `waiting for transaction ${txHash}`);
  }

  public async estimateGas(
    transaction: ethers.TransactionRequest,
    network?: string
  ): Promise<bigint> {
    const provider = this.getProvider(network);
    
    return this.executeWithRetry(async () => {
      return await provider.estimateGas(transaction);
    }, 'gas estimation');
  }

  public async getCurrentGasPrice(network?: string): Promise<bigint> {
    const provider = this.getProvider(network);
    
    return this.executeWithRetry(async () => {
      const feeData = await provider.getFeeData();
      return feeData.gasPrice || BigInt(0);
    }, 'gas price fetch');
  }

  public async getBalance(address: string, network?: string): Promise<bigint> {
    const provider = this.getProvider(network);
    
    return this.executeWithRetry(async () => {
      return await provider.getBalance(address);
    }, `balance check for ${address}`);
  }

  public async isContractAddress(address: string, network?: string): Promise<boolean> {
    try {
      const provider = this.getProvider(network);
      const code = await provider.getCode(address);
      return code !== '0x';
    } catch (error) {
      logger.error(`Failed to check if ${address} is a contract:`, error);
      return false;
    }
  }

  public formatEther(value: bigint): string {
    return ethers.formatEther(value);
  }

  public parseEther(value: string): bigint {
    return ethers.parseEther(value);
  }

  public formatUnits(value: bigint, decimals: number = 18): string {
    return ethers.formatUnits(value, decimals);
  }

  public parseUnits(value: string, decimals: number = 18): bigint {
    return ethers.parseUnits(value, decimals);
  }
}