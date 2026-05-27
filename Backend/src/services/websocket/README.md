# WebSocket Service Documentation

## Overview

The WebSocket service provides real-time communication capabilities for the Advanced Voting Platform. It enables instant notifications for election status updates, vote confirmations, and system notifications.

## Architecture

### Components

1. **WebSocketService** - Core WebSocket server implementation
2. **WebSocketManager** - Singleton manager for WebSocket service lifecycle
3. **WebSocketController** - HTTP API endpoints for WebSocket management
4. **Authentication** - JWT-based authentication for WebSocket connections

### Key Features

- **Real-time Election Updates**: Broadcast election status changes (start/end times, not vote counts)
- **Vote Confirmations**: Send individual vote confirmation notifications
- **System Notifications**: Send targeted or broadcast system messages
- **Room Management**: Organize clients into rooms for targeted messaging
- **Connection Authentication**: JWT-based authentication with role-based access
- **Heartbeat Monitoring**: Automatic detection and cleanup of dead connections

## Configuration

WebSocket configuration is managed through environment variables:

```env
# WebSocket Configuration
WS_PORT=3002
WS_CORS_ORIGIN=http://localhost:3000
```

## API Endpoints

### Authentication Required

All WebSocket API endpoints require authentication via JWT token in the Authorization header.

#### GET /api/v1/websocket/token
Get WebSocket connection token for the authenticated user.

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "jwt-token-here",
    "wsUrl": "ws://localhost:3002?token=jwt-token-here",
    "userId": "user-id"
  }
}
```

#### GET /api/v1/websocket/stats (Admin Only)
Get WebSocket connection statistics.

**Response:**
```json
{
  "success": true,
  "data": {
    "totalConnections": 5,
    "authenticatedConnections": 4,
    "rooms": {
      "public": 3,
      "election:election-id": 2,
      "admin": 1
    }
  }
}
```

#### POST /api/v1/websocket/notification
Send notification to a specific user.

**Request Body:**
```json
{
  "userId": "target-user-id",
  "type": "info|warning|error|success",
  "message": "Notification message",
  "title": "Optional title",
  "persistent": false
}
```

#### POST /api/v1/websocket/broadcast (Admin Only)
Broadcast notification to all connected users.

**Request Body:**
```json
{
  "type": "info|warning|error|success",
  "message": "Broadcast message",
  "title": "Optional title",
  "persistent": false
}
```

## WebSocket Connection

### Connection URL
```
ws://localhost:3002?token=<jwt-token>
```

### Authentication
Include JWT token as a query parameter when connecting.

### Connection Flow
1. Client connects with JWT token
2. Server verifies token and extracts user information
3. Server sends `connection_established` message
4. Client can join/leave rooms and receive messages

## Message Types

### Client to Server Messages

#### Join Room
```json
{
  "type": "join_room",
  "data": { "room": "room-name" },
  "timestamp": "2023-12-07T10:00:00.000Z"
}
```

#### Leave Room
```json
{
  "type": "leave_room",
  "data": { "room": "room-name" },
  "timestamp": "2023-12-07T10:00:00.000Z"
}
```

#### Ping
```json
{
  "type": "ping",
  "data": {},
  "timestamp": "2023-12-07T10:00:00.000Z"
}
```

### Server to Client Messages

#### Connection Established
```json
{
  "type": "connection_established",
  "data": {
    "userId": "user-id",
    "timestamp": "2023-12-07T10:00:00.000Z"
  },
  "timestamp": "2023-12-07T10:00:00.000Z"
}
```

#### Election Status Update
```json
{
  "type": "election_status_update",
  "data": {
    "electionId": "election-id",
    "status": "active|ended|cancelled",
    "startTime": "2023-12-07T10:00:00.000Z",
    "endTime": "2023-12-07T11:00:00.000Z",
    "title": "Election Title"
  },
  "timestamp": "2023-12-07T10:00:00.000Z",
  "room": "election:election-id"
}
```

#### Vote Confirmation
```json
{
  "type": "vote_confirmation",
  "data": {
    "electionId": "election-id",
    "transactionHash": "0x123...",
    "candidateId": "candidate-id",
    "timestamp": "2023-12-07T10:00:00.000Z",
    "status": "pending|confirmed|failed"
  },
  "timestamp": "2023-12-07T10:00:00.000Z"
}
```

#### System Notification
```json
{
  "type": "system_notification",
  "data": {
    "type": "info|warning|error|success",
    "message": "Notification message",
    "title": "Optional title",
    "persistent": false
  },
  "timestamp": "2023-12-07T10:00:00.000Z"
}
```

#### Room Events
```json
{
  "type": "room_joined|room_left|room_join_denied",
  "data": {
    "room": "room-name",
    "reason": "Access denied" // Only for room_join_denied
  },
  "timestamp": "2023-12-07T10:00:00.000Z"
}
```

#### Pong
```json
{
  "type": "pong",
  "data": {
    "timestamp": "2023-12-07T10:00:00.000Z"
  },
  "timestamp": "2023-12-07T10:00:00.000Z"
}
```

## Room Management

### Room Types

#### Public Room
- **Name**: `public`
- **Access**: All authenticated users
- **Purpose**: General announcements and election status updates

#### Admin Room
- **Name**: `admin`
- **Access**: Admin users only
- **Purpose**: Administrative notifications

#### User Rooms
- **Name**: `user:{userId}`
- **Access**: The specific user or admin users
- **Purpose**: Personal notifications and vote confirmations

#### Election Rooms
- **Name**: `election:{electionId}`
- **Access**: Eligible voters, creators, and admin users
- **Purpose**: Election-specific updates and notifications

### Room Access Control

Access to rooms is controlled based on user roles and permissions:

- **Public**: All authenticated users
- **Admin**: Admin role required
- **User rooms**: User must own the room or be an admin
- **Election rooms**: User must be eligible voter, creator, or admin

## Integration with Controllers

### VotingController Integration

The WebSocket service is integrated with the VotingController to send vote confirmations:

```typescript
// After successful vote submission
const wsManager = WebSocketManager.getInstance();
wsManager.sendVoteConfirmation(user.id, {
  electionId,
  transactionHash,
  candidateId: candidateIds[0],
  timestamp: new Date().toISOString(),
  status: 'pending'
});
```

### ElectionController Integration

Election status changes are broadcasted via WebSocket:

```typescript
// After election status update
const wsManager = WebSocketManager.getInstance();
wsManager.broadcastElectionStatus({
  electionId: election.id,
  status: newStatus,
  startTime: election.start_time?.toISOString(),
  endTime: election.end_time?.toISOString(),
  title: election.title
});
```

## Client Implementation Example

See `Backend/src/examples/websocket-client.ts` for a complete client implementation example.

### Basic Connection
```typescript
import WebSocket from 'ws';

const token = 'your-jwt-token';
const ws = new WebSocket(`ws://localhost:3002?token=${token}`);

ws.on('open', () => {
  console.log('Connected to WebSocket server');
  
  // Join public room
  ws.send(JSON.stringify({
    type: 'join_room',
    data: { room: 'public' },
    timestamp: new Date().toISOString()
  }));
});

ws.on('message', (data) => {
  const message = JSON.parse(data.toString());
  console.log('Received:', message);
});
```

## Security Considerations

1. **Authentication**: All connections must provide valid JWT tokens
2. **CORS**: Origin validation prevents unauthorized cross-origin connections
3. **Rate Limiting**: Heartbeat mechanism prevents resource exhaustion
4. **Room Access**: Role-based access control for sensitive rooms
5. **Input Validation**: All incoming messages are validated

## Error Handling

### Connection Errors
- Invalid or missing JWT token: Connection closed with code 1008
- Invalid origin: Connection rejected during handshake
- Authentication failure: Connection closed with error message

### Message Errors
- Invalid message format: Error message sent to client
- Room access denied: `room_join_denied` message sent
- Unknown message type: Warning logged, no response sent

## Monitoring and Health Checks

### Health Check Integration
WebSocket status is included in the main application health check:

```json
{
  "services": {
    "websocket": {
      "status": "healthy",
      "stats": {
        "totalConnections": 5,
        "authenticatedConnections": 4,
        "rooms": { "public": 3 }
      }
    }
  }
}
```

### Connection Statistics
Real-time statistics are available through the WebSocket manager:
- Total connections
- Authenticated connections
- Room membership counts

## Testing

### Unit Tests
- WebSocket service initialization and lifecycle
- Message broadcasting functionality
- Room management logic
- Authentication and authorization

### Integration Tests
- API endpoint functionality
- Database integration (when available)
- End-to-end message flow

Run tests:
```bash
npm test -- --testPathPattern=websocket-unit.test.ts
```

## Deployment Considerations

1. **Port Configuration**: Ensure WebSocket port (default 3002) is accessible
2. **Load Balancing**: Use sticky sessions for WebSocket connections
3. **Scaling**: Consider Redis adapter for multi-instance deployments
4. **Monitoring**: Monitor connection counts and message throughput
5. **Logging**: WebSocket events are logged for debugging and monitoring

## Future Enhancements

1. **Redis Adapter**: For horizontal scaling across multiple server instances
2. **Message Persistence**: Store messages for offline users
3. **Push Notifications**: Integration with mobile push notification services
4. **Advanced Room Features**: Private messaging, room moderation
5. **Analytics**: Message delivery tracking and user engagement metrics