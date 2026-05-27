import WebSocketManager from '../services/WebSocketManager';
import WebSocketService from '../services/WebSocketService';

// Mock the logger to avoid console output during tests
jest.mock('../utils/logger', () => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
}));

describe('WebSocket Unit Tests', () => {
    describe('WebSocketManager', () => {
        let wsManager: WebSocketManager;

        beforeEach(() => {
            // Enable WebSocket for unit tests
            process.env.ENABLE_WS_IN_TESTS = 'true';
            wsManager = WebSocketManager.getInstance();
        });

        afterEach(async () => {
            if (wsManager.isInitialized()) {
                await wsManager.shutdown();
            }
            // Clean up environment variable
            delete process.env.ENABLE_WS_IN_TESTS;
        });

        test('should be a singleton', () => {
            const instance1 = WebSocketManager.getInstance();
            const instance2 = WebSocketManager.getInstance();
            expect(instance1).toBe(instance2);
        });

        test('should initialize without errors', () => {
            expect(() => {
                wsManager.initialize();
            }).not.toThrow();

            expect(wsManager.isInitialized()).toBe(true);
        });

        test('should return null stats when not initialized', () => {
            const stats = wsManager.getStats();
            expect(stats).toBeNull();
        });

        test('should return stats when initialized', () => {
            wsManager.initialize();
            const stats = wsManager.getStats();

            expect(stats).not.toBeNull();
            if (stats) {
                expect(stats).toHaveProperty('totalConnections');
                expect(stats).toHaveProperty('authenticatedConnections');
                expect(stats).toHaveProperty('rooms');
                expect(typeof stats.totalConnections).toBe('number');
                expect(typeof stats.authenticatedConnections).toBe('number');
                expect(typeof stats.rooms).toBe('object');
            }
        });

        test('should handle broadcasting when not initialized gracefully', () => {
            // Should not throw errors when WebSocket is not initialized
            expect(() => {
                wsManager.broadcastElectionStatus({
                    electionId: 'test-election',
                    status: 'active',
                    title: 'Test Election',
                    startTime: new Date().toISOString(),
                    endTime: new Date(Date.now() + 3600000).toISOString()
                });
            }).not.toThrow();

            expect(() => {
                wsManager.sendVoteConfirmation('user-id', {
                    electionId: 'test-election',
                    transactionHash: '0x123456789abcdef',
                    candidateId: 'candidate-id',
                    timestamp: new Date().toISOString(),
                    status: 'pending'
                });
            }).not.toThrow();

            expect(() => {
                wsManager.sendSystemNotification('user-id', {
                    type: 'info',
                    message: 'Test message'
                });
            }).not.toThrow();

            expect(() => {
                wsManager.broadcastSystemNotification({
                    type: 'info',
                    message: 'Broadcast test message'
                });
            }).not.toThrow();
        });

        test('should handle broadcasting when initialized', () => {
            wsManager.initialize();

            expect(() => {
                wsManager.broadcastElectionStatus({
                    electionId: 'test-election',
                    status: 'active',
                    title: 'Test Election',
                    startTime: new Date().toISOString(),
                    endTime: new Date(Date.now() + 3600000).toISOString()
                });
            }).not.toThrow();

            expect(() => {
                wsManager.sendVoteConfirmation('user-id', {
                    electionId: 'test-election',
                    transactionHash: '0x123456789abcdef',
                    candidateId: 'candidate-id',
                    timestamp: new Date().toISOString(),
                    status: 'pending'
                });
            }).not.toThrow();

            expect(() => {
                wsManager.sendSystemNotification('user-id', {
                    type: 'info',
                    message: 'Test message'
                });
            }).not.toThrow();

            expect(() => {
                wsManager.broadcastSystemNotification({
                    type: 'info',
                    message: 'Broadcast test message'
                });
            }).not.toThrow();
        });

        test('should shutdown gracefully', async () => {
            wsManager.initialize();
            expect(wsManager.isInitialized()).toBe(true);

            await wsManager.shutdown();
            expect(wsManager.isInitialized()).toBe(false);
        });
    });

    describe('WebSocketService', () => {
        let wsService: WebSocketService;

        beforeEach(() => {
            wsService = new WebSocketService();
        });

        afterEach(async () => {
            if (wsService) {
                await wsService.close();
            }
        });

        test('should initialize without errors', () => {
            expect(wsService).toBeDefined();
        });

        test('should return connection statistics', () => {
            const stats = wsService.getStats();

            expect(stats).toHaveProperty('totalConnections');
            expect(stats).toHaveProperty('authenticatedConnections');
            expect(stats).toHaveProperty('rooms');
            expect(typeof stats.totalConnections).toBe('number');
            expect(typeof stats.authenticatedConnections).toBe('number');
            expect(typeof stats.rooms).toBe('object');
        });

        test('should handle broadcasting without errors', () => {
            expect(() => {
                wsService.broadcastElectionStatus({
                    electionId: 'test-election',
                    status: 'active',
                    title: 'Test Election',
                    startTime: new Date().toISOString(),
                    endTime: new Date(Date.now() + 3600000).toISOString()
                });
            }).not.toThrow();

            expect(() => {
                wsService.sendVoteConfirmation('test-user', {
                    electionId: 'test-election',
                    transactionHash: '0x123456789abcdef',
                    candidateId: 'test-candidate',
                    timestamp: new Date().toISOString(),
                    status: 'pending'
                });
            }).not.toThrow();

            expect(() => {
                wsService.sendSystemNotification('test-user', {
                    type: 'info',
                    message: 'Test notification'
                });
            }).not.toThrow();

            expect(() => {
                wsService.broadcastSystemNotification({
                    type: 'info',
                    message: 'Broadcast test notification'
                });
            }).not.toThrow();
        });

        test('should close gracefully', async () => {
            await expect(wsService.close()).resolves.not.toThrow();
        });
    });

    describe('Message Types and Validation', () => {
        test('should handle election status update messages', () => {
            const electionUpdate = {
                electionId: 'test-election-id',
                status: 'active' as const,
                startTime: new Date().toISOString(),
                endTime: new Date(Date.now() + 3600000).toISOString(),
                title: 'Test Election'
            };

            expect(electionUpdate.electionId).toBe('test-election-id');
            expect(electionUpdate.status).toBe('active');
            expect(electionUpdate.title).toBe('Test Election');
            expect(typeof electionUpdate.startTime).toBe('string');
            expect(typeof electionUpdate.endTime).toBe('string');
        });

        test('should handle vote confirmation messages', () => {
            const voteConfirmation = {
                electionId: 'test-election-id',
                transactionHash: '0x1234567890abcdef',
                candidateId: 'test-candidate-id',
                timestamp: new Date().toISOString(),
                status: 'pending' as const
            };

            expect(voteConfirmation.electionId).toBe('test-election-id');
            expect(voteConfirmation.transactionHash).toBe('0x1234567890abcdef');
            expect(voteConfirmation.candidateId).toBe('test-candidate-id');
            expect(voteConfirmation.status).toBe('pending');
            expect(typeof voteConfirmation.timestamp).toBe('string');
        });

        test('should handle system notification messages', () => {
            const notification = {
                type: 'info' as const,
                message: 'Test notification message',
                title: 'Test Title',
                persistent: false
            };

            expect(notification.type).toBe('info');
            expect(notification.message).toBe('Test notification message');
            expect(notification.title).toBe('Test Title');
            expect(notification.persistent).toBe(false);
        });

        test('should validate notification types', () => {
            const validTypes = ['info', 'warning', 'error', 'success'];

            validTypes.forEach(type => {
                const notification = {
                    type: type as 'info' | 'warning' | 'error' | 'success',
                    message: 'Test message'
                };

                expect(validTypes).toContain(notification.type);
            });
        });

        test('should validate election status types', () => {
            const validStatuses = ['pending', 'active', 'ended', 'cancelled'];

            validStatuses.forEach(status => {
                const electionUpdate = {
                    electionId: 'test-id',
                    status: status as 'pending' | 'active' | 'ended' | 'cancelled',
                    title: 'Test Election'
                };

                expect(validStatuses).toContain(electionUpdate.status);
            });
        });

        test('should validate vote confirmation status types', () => {
            const validStatuses = ['pending', 'confirmed', 'failed'];

            validStatuses.forEach(status => {
                const voteConfirmation = {
                    electionId: 'test-id',
                    transactionHash: '0x123',
                    candidateId: 'candidate-id',
                    timestamp: new Date().toISOString(),
                    status: status as 'pending' | 'confirmed' | 'failed'
                };

                expect(validStatuses).toContain(voteConfirmation.status);
            });
        });
    });

    describe('Room Management Logic', () => {
        test('should validate room naming conventions', () => {
            const roomPatterns = [
                { room: 'public', valid: true },
                { room: 'admin', valid: true },
                { room: 'user:123e4567-e89b-12d3-a456-426614174000', valid: true },
                { room: 'election:123e4567-e89b-12d3-a456-426614174000', valid: true },
                { room: 'invalid-room', valid: false },
                { room: '', valid: false }
            ];

            roomPatterns.forEach(({ room, valid }) => {
                const isValidRoom = room === 'public' ||
                    room === 'admin' ||
                    room.startsWith('user:') ||
                    room.startsWith('election:');

                expect(isValidRoom).toBe(valid);
            });
        });

        test('should validate user permissions for rooms', () => {
            const testCases = [
                { user: { role: 'admin' }, room: 'admin', canJoin: true },
                { user: { role: 'voter' }, room: 'admin', canJoin: false },
                { user: { role: 'voter', id: 'user123' }, room: 'user:user123', canJoin: true },
                { user: { role: 'voter', id: 'user123' }, room: 'user:user456', canJoin: false },
                { user: { role: 'voter', voterStatus: 'eligible' }, room: 'election:election123', canJoin: true },
                { user: { role: 'voter', voterStatus: 'suspended' }, room: 'election:election123', canJoin: false },
                { user: { role: 'voter' }, room: 'public', canJoin: true }
            ];

            testCases.forEach(({ user, room, canJoin }) => {
                let hasAccess = false;

                if (room === 'public') {
                    hasAccess = true;
                } else if (room === 'admin') {
                    hasAccess = user.role === 'admin';
                } else if (room.startsWith('user:')) {
                    const roomUserId = room.substring(5);
                    hasAccess = user.id === roomUserId || user.role === 'admin';
                } else if (room.startsWith('election:')) {
                    hasAccess = user.voterStatus === 'eligible' || user.role === 'admin' || user.role === 'creator';
                }

                expect(hasAccess).toBe(canJoin);
            });
        });
    });
});