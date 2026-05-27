import { ethers } from 'ethers';

export interface NetworkConfig {
  name: string;
  rpcUrl: string;
  chainId: number;
  gasPrice?: string;
  gasLimit?: number;
}

export interface ContractConfig {
  address: string;
  abi: any[];
}

export interface TransactionOptions {
  gasLimit?: number;
  gasPrice?: string;
  maxFeePerGas?: string;
  maxPriorityFeePerGas?: string;
  nonce?: number;
}

export interface TransactionResult {
  hash: string;
  receipt?: ethers.TransactionReceipt;
  success: boolean;
  error?: string;
  gasUsed?: bigint;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
}

export interface EventFilter {
  address?: string;
  topics?: (string | string[])[];
  fromBlock?: number | string;
  toBlock?: number | string;
}

export interface BlockchainEvent {
  eventName: string;
  contractAddress: string;
  blockNumber: number;
  transactionHash: string;
  args: any;
  timestamp: number;
}

export interface GasEstimation {
  gasLimit: bigint;
  gasPrice: bigint;
  maxFeePerGas?: bigint;
  maxPriorityFeePerGas?: bigint;
  estimatedCost: bigint;
}

export interface ElectionData {
  id: number;
  title: string;
  description: string;
  startTime: number;
  endTime: number;
  electionType: number;
  status: number;
  creator: string;
  isPublic: boolean;
  totalVotes: number;
  candidateCount: number;
}

export interface CandidateData {
  id: number;
  name: string;
  description: string;
  imageUrl: string;
  voteCount: number;
  isActive: boolean;
}

export interface VoteData {
  electionId: number;
  candidateIds: number[];
  voter: string;
  timestamp: number;
  transactionHash: string;
}