import { ethers } from 'ethers';
import { Web3Provider } from './Web3Provider';
import { ContractConfig, TransactionOptions, TransactionResult, GasEstimation } from './types';
import logger from '../../utils/logger';
import config from '../../config';

export class ContractService {
  private web3Provider: Web3Provider;
  private contracts: Map<string, ethers.Contract> = new Map();
  private contractConfigs: Map<string, ContractConfig> = new Map();

  constructor() {
    this.web3Provider = Web3Provider.getInstance();
    this.initializeContracts();
  }

  private async initializeContracts(): Promise<void> {
    try {
      // Load contract ABIs and addresses
      const votingABI = await this.loadContractABI('CollegeVoting');
      const factoryABI = await this.loadContractABI('ElectionFactory');

      // Configure contracts
      if (config.blockchain.contractAddress && votingABI) {
        this.contractConfigs.set('CollegeVoting', {
          address: config.blockchain.contractAddress,
          abi: votingABI,
        });
      }

      if (config.blockchain.factoryContractAddress && factoryABI) {
        this.contractConfigs.set('ElectionFactory', {
          address: config.blockchain.factoryContractAddress,
          abi: factoryABI,
        });
      }

      // Initialize contract instances
      for (const [name, contractConfig] of this.contractConfigs) {
        await this.initializeContract(name, contractConfig);
      }

      logger.info('Contract service initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize contract service:', error);
      throw error;
    }
  }

  private async loadContractABI(contractName: string): Promise<any[] | null> {
    try {
      // Try to load from deployed contracts first
      const deployedPath = `../../../Blockchain/deployed/${contractName}_${config.blockchain.network}.json`;
      try {
        const deployedContract = require(deployedPath);
        if (deployedContract.abi) {
          logger.info(`Loaded ${contractName} ABI from deployed contracts`);
          return deployedContract.abi;
        }
      } catch (deployedError) {
        logger.debug(`Could not load ${contractName} from deployed contracts:`, deployedError);
      }

      // Fallback to standalone ABI files
      const abiPath = `../../../Blockchain/${contractName}ABI.json`;
      const abi = require(abiPath);
      logger.info(`Loaded ${contractName} ABI from standalone file`);
      return abi;
    } catch (error) {
      logger.error(`Failed to load ABI for ${contractName}:`, error);
      return null;
    }
  }

  private async initializeContract(name: string, contractConfig: ContractConfig): Promise<void> {
    try {
      const provider = this.web3Provider.getProvider();
      const signer = this.web3Provider.getSigner();

      // Create contract instance with signer for write operations
      const contract = new ethers.Contract(contractConfig.address, contractConfig.abi, signer);

      // Verify contract exists
      const isContract = await this.web3Provider.isContractAddress(contractConfig.address);
      if (!isContract) {
        throw new Error(`No contract found at address ${contractConfig.address}`);
      }

      this.contracts.set(name, contract);
      logger.info(`Initialized contract ${name} at ${contractConfig.address}`);
    } catch (error) {
      logger.error(`Failed to initialize contract ${name}:`, error);
      throw error;
    }
  }

  public getContract(name: string): ethers.Contract {
    const contract = this.contracts.get(name);
    if (!contract) {
      throw new Error(`Contract ${name} not found. Available contracts: ${Array.from(this.contracts.keys()).join(', ')}`);
    }
    return contract;
  }

  public getContractAddress(name: string): string {
    const config = this.contractConfigs.get(name);
    if (!config) {
      throw new Error(`Contract configuration for ${name} not found`);
    }
    return config.address;
  }

  public async estimateGas(
    contractName: string,
    methodName: string,
    args: any[] = [],
    options: TransactionOptions = {}
  ): Promise<GasEstimation> {
    const contract = this.getContract(contractName);
    
    return this.web3Provider.executeWithRetry(async () => {
      // Estimate gas for the transaction
      const gasLimit = await contract[methodName].estimateGas(...args, options);
      
      // Get current gas price
      const gasPrice = await this.web3Provider.getCurrentGasPrice();
      
      // Get fee data for EIP-1559 transactions
      const provider = this.web3Provider.getProvider();
      const feeData = await provider.getFeeData();
      
      const estimatedCost = gasLimit * gasPrice;

      const estimation: GasEstimation = {
        gasLimit,
        gasPrice,
        estimatedCost,
      };

      // Add EIP-1559 fee data if available
      if (feeData.maxFeePerGas && feeData.maxPriorityFeePerGas) {
        estimation.maxFeePerGas = feeData.maxFeePerGas;
        estimation.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
      }

      return estimation;
    }, `gas estimation for ${contractName}.${methodName}`);
  }

  public async callMethod(
    contractName: string,
    methodName: string,
    args: any[] = [],
    options: TransactionOptions = {}
  ): Promise<TransactionResult> {
    const contract = this.getContract(contractName);
    
    return this.web3Provider.executeWithRetry(async () => {
      try {
        logger.info(`Calling ${contractName}.${methodName} with args:`, args);

        // Estimate gas if not provided
        if (!options.gasLimit) {
          const gasEstimation = await this.estimateGas(contractName, methodName, args, options);
          options.gasLimit = Number(gasEstimation.gasLimit * BigInt(120) / BigInt(100)); // Add 20% buffer
        }

        // Execute transaction
        const tx = await contract[methodName](...args, options);
        logger.info(`Transaction sent: ${tx.hash}`);

        // Wait for confirmation
        const receipt = await this.web3Provider.waitForTransaction(tx.hash);
        
        const result: TransactionResult = {
          hash: tx.hash,
          receipt,
          success: receipt.status === 1,
          gasUsed: receipt.gasUsed,
        };

        if (result.success) {
          logger.info(`Transaction ${tx.hash} confirmed successfully. Gas used: ${receipt.gasUsed}`);
        } else {
          logger.error(`Transaction ${tx.hash} failed`);
          result.error = 'Transaction failed';
        }

        return result;
      } catch (error) {
        logger.error(`Failed to call ${contractName}.${methodName}:`, error);
        return {
          hash: '',
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }, `${contractName}.${methodName} call`);
  }

  public async readMethod(
    contractName: string,
    methodName: string,
    args: any[] = []
  ): Promise<any> {
    const contract = this.getContract(contractName);
    
    return this.web3Provider.executeWithRetry(async () => {
      try {
        logger.debug(`Reading ${contractName}.${methodName} with args:`, args);
        const result = await contract[methodName](...args);
        logger.debug(`Read result from ${contractName}.${methodName}:`, result);
        return result;
      } catch (error) {
        logger.error(`Failed to read ${contractName}.${methodName}:`, error);
        throw error;
      }
    }, `${contractName}.${methodName} read`);
  }

  public async batchRead(
    contractName: string,
    calls: Array<{ method: string; args: any[] }>
  ): Promise<any[]> {
    const contract = this.getContract(contractName);
    
    return this.web3Provider.executeWithRetry(async () => {
      const promises = calls.map(call => 
        contract[call.method](...call.args).catch((error: Error) => {
          logger.error(`Batch read failed for ${call.method}:`, error);
          return null;
        })
      );
      
      return Promise.all(promises);
    }, `batch read from ${contractName}`);
  }

  public async getContractEvents(
    contractName: string,
    eventName: string,
    fromBlock: number | string = 'earliest',
    toBlock: number | string = 'latest',
    additionalFilters: any = {}
  ): Promise<ethers.EventLog[]> {
    const contract = this.getContract(contractName);
    
    return this.web3Provider.executeWithRetry(async () => {
      const filter = contract.filters[eventName](...Object.values(additionalFilters));
      const events = await contract.queryFilter(filter, fromBlock, toBlock);
      
      // Filter out non-EventLog entries and return only EventLog instances
      return events.filter((event): event is ethers.EventLog => 
        event instanceof ethers.EventLog
      );
    }, `querying ${eventName} events from ${contractName}`);
  }

  public async deployContract(
    contractName: string,
    bytecode: string,
    abi: any[],
    constructorArgs: any[] = [],
    options: TransactionOptions = {}
  ): Promise<{ address: string; transactionHash: string; contract: any }> {
    const signer = this.web3Provider.getSigner();
    
    return this.web3Provider.executeWithRetry(async () => {
      const factory = new ethers.ContractFactory(abi, bytecode, signer);
      
      // Estimate deployment gas
      const deployTransaction = await factory.getDeployTransaction(...constructorArgs);
      const gasLimit = await this.web3Provider.estimateGas(deployTransaction);
      
      // Deploy contract
      const contract = await factory.deploy(...constructorArgs, {
        gasLimit: Number(gasLimit * BigInt(120) / BigInt(100)), // Add 20% buffer
        ...options,
      });
      
      // Wait for deployment
      await contract.waitForDeployment();
      const address = await contract.getAddress();
      
      logger.info(`Contract ${contractName} deployed at ${address}`);
      
      // Store contract configuration
      this.contractConfigs.set(contractName, { address, abi });
      this.contracts.set(contractName, contract as ethers.Contract);
      
      return {
        address,
        transactionHash: contract.deploymentTransaction()?.hash || '',
        contract,
      };
    }, `deploying ${contractName}`);
  }

  public async refreshContract(contractName: string): Promise<void> {
    const config = this.contractConfigs.get(contractName);
    if (!config) {
      throw new Error(`Contract configuration for ${contractName} not found`);
    }
    
    await this.initializeContract(contractName, config);
    logger.info(`Refreshed contract ${contractName}`);
  }

  public getAvailableContracts(): string[] {
    return Array.from(this.contracts.keys());
  }

  public async verifyContractConnection(contractName: string): Promise<boolean> {
    try {
      const contract = this.getContract(contractName);
      const address = await contract.getAddress();
      const isContract = await this.web3Provider.isContractAddress(address);
      
      if (isContract) {
        logger.info(`Contract ${contractName} verified at ${address}`);
        return true;
      } else {
        logger.error(`No contract code found at ${address} for ${contractName}`);
        return false;
      }
    } catch (error) {
      logger.error(`Failed to verify contract ${contractName}:`, error);
      return false;
    }
  }
}