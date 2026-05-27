# Blockchain Integration Service

This service provides a comprehensive blockchain integration layer for the Advanced Voting Platform. It handles Web3 provider management, smart contract interactions, transaction processing, and real-time event listening.

## Architecture

The blockchain integration service consists of several interconnected components:

- **Web3Provider**: Manages blockchain network connections and providers
- **ContractService**: Handles smart contract interactions and deployments
- **TransactionService**: Manages transaction execution, queuing, and monitoring
- **EventListenerService**: Listens for blockchain events in real-time
- **BlockchainService**: Main service that orchestrates all blockchain operations

## Features

### Multi-Network Support
- Supports multiple blockchain networks (localhost, hardhat, sepolia, mainnet)
- Automatic network switching and configuration
- Network-specific gas optimization

### Smart Contract Management
- Automatic contract deployment and initialization
- Contract method execution with retry logic
- Gas estimation and optimization
- Batch operations support

### Transaction Processing
- Transaction queuing and batch processing
- Automatic retry with exponential backoff
- Gas price optimization based on network conditions
- Transaction monitoring and confirmation

### Real-Time Event Listening
- Automatic event listener setup for all contract events
- Real-time event processing and forwarding
- Historical event querying
- Connection recovery and missed event synchronization

### Error Handling & Reliability
- Comprehensive error handling at all levels
- Automatic reconnection on connection loss
- Health monitoring and status reporting
- Graceful degradation on failures

## Usage

### Basic Setup

```typescript
import { BlockchainService } from './services/blockchain';

// Get singleton instance
const blockchainService = BlockchainService.getInstance();

// Initialize the service
await blockchainService.initialize();
```

### Creating Elections

```typescript
// Create a new election
const result = await blockchainService.createElection(
  'Student Council Election',
  'Annual student council election',
  Math.floor(Date.now() / 1000) + 3600, // Start time
  Math.floor(Date.now() / 1000) + 86400, // End time
  0, // Election type (single choice)
  true, // Public election
  1 // Max choices
);

if (result.success) {
  console.log(`Election created: ${result.hash}`);
}
```

### Casting Votes

```typescript
// Cast a vote
const voteResult = await blockchainService.castVote(
  electionId,
  [candidateId] // Array of candidate IDs
);

if (voteResult.success) {
  console.log(`Vote cast: ${voteResult.hash}`);
}
```

### Event Listening

```typescript
// Listen for vote cast events
blockchainService.on('voteCast', (event) => {
  console.log(`Vote cast in election ${event.args.electionId}`);
  // Update database, notify users, etc.
});

// Listen for new elections
blockchainService.on('electionCreated', (event) => {
  console.log(`New election: ${event.args.name}`);
});
```

### Gas Estimation

```typescript
// Estimate gas for a transaction
const gasEstimation = await blockchainService.estimateGas(
  'CollegeVoting',
  'castVote',
  [electionId, candidateIds]
);

console.log(`Estimated gas: ${gasEstimation.gasLimit}`);
console.log(`Estimated cost: ${gasEstimation.estimatedCost} wei`);
```

### Health Monitoring

```typescript
// Get service health status
const health = await blockchainService.getHealthStatus();

console.log(`Connected: ${health.isConnected}`);
console.log(`Network: ${health.networkInfo.name}`);
console.log(`Event listener active: ${health.eventListenerActive}`);
```

## Configuration

The service uses the following configuration from `config/index.ts`:

```typescript
blockchain: {
  network: 'localhost',           // Network name
  rpcUrl: 'http://127.0.0.1:8545', // RPC endpoint
  privateKey: 'your-private-key',  // Private key for transactions
  contractAddress: '0x...',       // CollegeVoting contract address
  factoryContractAddress: '0x...', // ElectionFactory contract address
}
```

## Environment Variables

Required environment variables:

```bash
# Blockchain Configuration
BLOCKCHAIN_NETWORK=localhost
BLOCKCHAIN_RPC_URL=http://127.0.0.1:8545
PRIVATE_KEY=your-private-key-here
CONTRACT_ADDRESS=0x...
FACTORY_CONTRACT_ADDRESS=0x...

# Optional: Network-specific RPC URLs
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/YOUR_PROJECT_ID
MAINNET_RPC_URL=https://mainnet.infura.io/v3/YOUR_PROJECT_ID
```

## Error Handling

The service implements comprehensive error handling:

```typescript
try {
  const result = await blockchainService.castVote(electionId, candidateIds);
  if (!result.success) {
    console.error('Vote failed:', result.error);
  }
} catch (error) {
  console.error('Blockchain operation failed:', error);
}
```

## Events

The service emits the following events:

- `initialized`: Service successfully initialized
- `shutdown`: Service shut down
- `blockchainEvent`: Any blockchain event received
- `voteCast`: Vote cast event
- `electionCreated`: New election created
- `electionDeployed`: New election deployed via factory
- `connectionLost`: Blockchain connection lost
- `reconnected`: Connection restored

## Testing

Run the blockchain service tests:

```bash
npm test -- --testPathPattern=blockchain-simple.test.ts
```

## Dependencies

- **ethers**: Ethereum library for blockchain interactions
- **ws**: WebSocket library for real-time connections

## Best Practices

1. **Always initialize the service** before using any blockchain operations
2. **Handle errors gracefully** - blockchain operations can fail for various reasons
3. **Monitor gas prices** - use gas estimation before executing transactions
4. **Listen for events** - use event listeners to keep your application in sync
5. **Implement health checks** - monitor service health in production
6. **Graceful shutdown** - always call shutdown() when stopping your application

## Troubleshooting

### Common Issues

1. **Connection Failed**: Check RPC URL and network configuration
2. **Transaction Failed**: Verify gas settings and account balance
3. **Contract Not Found**: Ensure contract addresses are correct
4. **Private Key Issues**: Verify private key format and permissions

### Debug Logging

Enable debug logging to troubleshoot issues:

```bash
LOG_LEVEL=debug npm start
```

## Production Considerations

1. **Security**: Never expose private keys in code or logs
2. **Monitoring**: Implement comprehensive monitoring and alerting
3. **Backup**: Ensure proper backup of critical data
4. **Scaling**: Consider load balancing for high-traffic applications
5. **Gas Optimization**: Monitor and optimize gas usage
6. **Network Reliability**: Implement fallback RPC endpoints

## Contributing

When contributing to the blockchain service:

1. Add comprehensive tests for new features
2. Update documentation for API changes
3. Follow TypeScript best practices
4. Implement proper error handling
5. Add logging for debugging purposes