import { ethers } from 'ethers';
import { Web3Provider } from './Web3Provider';
import { ContractService } from './ContractService';
import { TransactionOptions, TransactionResult, GasEstimation } from './types';
import logger from '../../utils/logger';

export class TransactionService {
  private web3Provider: Web3Provider;
  private contractService: ContractService;
  private pendingTransactions: Map<string, TransactionResult> = new Map();
  private transactionQueue: Array<{
    id: string;
    contractName: string;
    methodName: string;
    args: any[];
    options: TransactionOptions;
    resolve: (result: TransactionResult) => void;
    reject: (error: Error) => void;
  }> = [];
  private isProcessingQueue = false;

  constructor(contractService: ContractService) {
    this.web3Provider = Web3Provider.getInstance();
    this.contractService = contractService;
  }

  public async executeTransaction(
    contractName: string,
    methodName: string,
    args: any[] = [],
    options: TransactionOptions = {}
  ): Promise<TransactionResult> {
    const transactionId = this.generateTransactionId();
    
    try {
      logger.info(`Executing transaction ${transactionId}: ${contractName}.${methodName}`);
      
      // Optimize gas settings
      const optimizedOptions = await this.optimizeGasSettings(contractName, methodName, args, options);
      
      // Execute the transaction
      const result = await this.contractService.callMethod(contractName, methodName, args, optimizedOptions);
      
      // Store result for tracking
      this.pendingTransactions.set(transactionId, result);
      
      // Monitor transaction if it was successful
      if (result.success && result.hash) {
        this.monitorTransaction(transactionId, result.hash);
      }
      
      return result;
    } catch (error) {
      logger.error(`Transaction ${transactionId} failed:`, error);
      throw error;
    }
  }

  public async queueTransaction(
    contractName: string,
    methodName: string,
    args: any[] = [],
    options: TransactionOptions = {}
  ): Promise<TransactionResult> {
    return new Promise((resolve, reject) => {
      const transactionId = this.generateTransactionId();
      
      this.transactionQueue.push({
        id: transactionId,
        contractName,
        methodName,
        args,
        options,
        resolve,
        reject,
      });
      
      logger.info(`Queued transaction ${transactionId}: ${contractName}.${methodName}`);
      
      // Start processing queue if not already running
      if (!this.isProcessingQueue) {
        this.processTransactionQueue();
      }
    });
  }

  private async processTransactionQueue(): Promise<void> {
    if (this.isProcessingQueue || this.transactionQueue.length === 0) {
      return;
    }
    
    this.isProcessingQueue = true;
    logger.info(`Processing transaction queue with ${this.transactionQueue.length} transactions`);
    
    while (this.transactionQueue.length > 0) {
      const transaction = this.transactionQueue.shift();
      if (!transaction) continue;
      
      try {
        const result = await this.executeTransaction(
          transaction.contractName,
          transaction.methodName,
          transaction.args,
          transaction.options
        );
        transaction.resolve(result);
      } catch (error) {
        transaction.reject(error as Error);
      }
      
      // Add delay between transactions to avoid nonce issues
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    this.isProcessingQueue = false;
    logger.info('Transaction queue processing completed');
  }

  public async batchExecute(
    transactions: Array<{
      contractName: string;
      methodName: string;
      args: any[];
      options?: TransactionOptions;
    }>
  ): Promise<TransactionResult[]> {
    logger.info(`Executing batch of ${transactions.length} transactions`);
    
    const results: TransactionResult[] = [];
    
    for (const tx of transactions) {
      try {
        const result = await this.executeTransaction(
          tx.contractName,
          tx.methodName,
          tx.args,
          tx.options || {}
        );
        results.push(result);
        
        // Add delay between transactions
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        logger.error(`Batch transaction failed:`, error);
        results.push({
          hash: '',
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }
    
    return results;
  }

  public async estimateTransactionCost(
    contractName: string,
    methodName: string,
    args: any[] = [],
    options: TransactionOptions = {}
  ): Promise<GasEstimation> {
    return this.contractService.estimateGas(contractName, methodName, args, options);
  }

  private async optimizeGasSettings(
    contractName: string,
    methodName: string,
    args: any[],
    options: TransactionOptions
  ): Promise<TransactionOptions> {
    const optimizedOptions = { ...options };
    
    try {
      // Get gas estimation
      const gasEstimation = await this.estimateTransactionCost(contractName, methodName, args, options);
      
      // Set gas limit with buffer if not provided
      if (!optimizedOptions.gasLimit) {
        optimizedOptions.gasLimit = Number(gasEstimation.gasLimit * BigInt(120) / BigInt(100)); // 20% buffer
      }
      
      // Optimize gas price based on network conditions
      if (!optimizedOptions.gasPrice && !optimizedOptions.maxFeePerGas) {
        const currentGasPrice = await this.web3Provider.getCurrentGasPrice();
        
        // Use EIP-1559 if available
        if (gasEstimation.maxFeePerGas && gasEstimation.maxPriorityFeePerGas) {
          optimizedOptions.maxFeePerGas = gasEstimation.maxFeePerGas.toString();
          optimizedOptions.maxPriorityFeePerGas = gasEstimation.maxPriorityFeePerGas.toString();
        } else {
          // Increase gas price by 10% for faster confirmation
          optimizedOptions.gasPrice = (currentGasPrice * BigInt(110) / BigInt(100)).toString();
        }
      }
      
      logger.debug(`Optimized gas settings for ${contractName}.${methodName}:`, optimizedOptions);
      
    } catch (error) {
      logger.warn(`Failed to optimize gas settings, using defaults:`, error);
    }
    
    return optimizedOptions;
  }

  private async monitorTransaction(transactionId: string, txHash: string): Promise<void> {
    try {
      logger.info(`Monitoring transaction ${transactionId}: ${txHash}`);
      
      // Wait for confirmation with timeout
      const receipt = await this.web3Provider.waitForTransaction(txHash, 1, 300000); // 5 minute timeout
      
      // Update transaction result
      const result = this.pendingTransactions.get(transactionId);
      if (result) {
        result.receipt = receipt;
        result.success = receipt.status === 1;
        result.gasUsed = receipt.gasUsed;
        
        if (result.success) {
          logger.info(`Transaction ${transactionId} confirmed successfully`);
        } else {
          logger.error(`Transaction ${transactionId} failed on-chain`);
          result.error = 'Transaction failed on-chain';
        }
      }
      
    } catch (error) {
      logger.error(`Failed to monitor transaction ${transactionId}:`, error);
      
      const result = this.pendingTransactions.get(transactionId);
      if (result) {
        result.success = false;
        result.error = error instanceof Error ? error.message : 'Transaction monitoring failed';
      }
    }
  }

  public async retryTransaction(
    transactionId: string,
    newGasPrice?: string
  ): Promise<TransactionResult> {
    const originalResult = this.pendingTransactions.get(transactionId);
    if (!originalResult) {
      throw new Error(`Transaction ${transactionId} not found`);
    }
    
    if (originalResult.success) {
      throw new Error(`Transaction ${transactionId} already succeeded`);
    }
    
    logger.info(`Retrying transaction ${transactionId} with new gas price: ${newGasPrice}`);
    
    // This would require storing original transaction parameters
    // For now, throw an error indicating this feature needs the original parameters
    throw new Error('Transaction retry requires storing original parameters - not implemented yet');
  }

  public async cancelTransaction(transactionId: string): Promise<TransactionResult> {
    const originalResult = this.pendingTransactions.get(transactionId);
    if (!originalResult) {
      throw new Error(`Transaction ${transactionId} not found`);
    }
    
    if (originalResult.success) {
      throw new Error(`Transaction ${transactionId} already succeeded and cannot be cancelled`);
    }
    
    // To cancel a transaction, we need to send a new transaction with the same nonce
    // but higher gas price to the same address with 0 value
    logger.info(`Attempting to cancel transaction ${transactionId}`);
    
    // This would require getting the original transaction nonce and sending a replacement
    throw new Error('Transaction cancellation not implemented yet');
  }

  public getTransactionStatus(transactionId: string): TransactionResult | null {
    return this.pendingTransactions.get(transactionId) || null;
  }

  public getPendingTransactions(): Map<string, TransactionResult> {
    return new Map(this.pendingTransactions);
  }

  public async waitForConfirmation(
    txHash: string,
    confirmations: number = 1,
    timeout: number = 300000
  ): Promise<ethers.TransactionReceipt> {
    return this.web3Provider.waitForTransaction(txHash, confirmations, timeout);
  }

  public async getTransactionReceipt(txHash: string): Promise<ethers.TransactionReceipt | null> {
    try {
      const provider = this.web3Provider.getProvider();
      return await provider.getTransactionReceipt(txHash);
    } catch (error) {
      logger.error(`Failed to get transaction receipt for ${txHash}:`, error);
      return null;
    }
  }

  public async getTransaction(txHash: string): Promise<ethers.TransactionResponse | null> {
    try {
      const provider = this.web3Provider.getProvider();
      return await provider.getTransaction(txHash);
    } catch (error) {
      logger.error(`Failed to get transaction ${txHash}:`, error);
      return null;
    }
  }

  private generateTransactionId(): string {
    return `tx_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  public clearCompletedTransactions(): void {
    const completed = Array.from(this.pendingTransactions.entries())
      .filter(([_, result]) => result.success || result.error)
      .map(([id]) => id);
    
    completed.forEach(id => this.pendingTransactions.delete(id));
    
    logger.info(`Cleared ${completed.length} completed transactions`);
  }

  public getQueueLength(): number {
    return this.transactionQueue.length;
  }
}