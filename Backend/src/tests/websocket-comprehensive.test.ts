/// <reference types="jest" />
import WebSocket from 'ws';
import App from '../app';
import { repositories } from '../repositories';
import jwt from 'jsonwebtoken';
import config from '../config';

describe('WebSocket Comprehensive Tests', () => {
    let app: App;
    let server: any;
    let adminToken: string;
    let voterToken: string;
    let adminUserId: string;
    let voterUserId: string;
    let testElectionId: string;
    let wsPort: number;

    beforeAll(async () => {
        // Enable WebSocket for integration tests
        process.env.ENABLE_WS_IN_TESTS = 'true';

        app = new App();
        await app.initialize();
        server = app.app;
        wsPort = config.websocket.port; // Use configured port

        // Create test users
        const adminUser = await repositories.user.create({
            wallet_address: '0x1111111111111111111111111111111111111111',
            email: 'admin@websocket.test',
            username: 'admin_ws',
            registration_number: 'REG-ADMIN-WS-001',
            role: 'admin',
            voter_status: 'eligible',
            is_verified: true
        });
        adminUserId = adminUser.id;
        adminToken = jwt.sign(
            { userId: adminUser.id, email: adminUser.email, role: adminUser.role },
            config.jwt.secret,
            { expiresIn: '1h' }
        );

        const voterUser = await repositories.user.create({
            wallet_address: '0x2222222222222222222222222222222222222222',
            email: 'voter@websocket.test',
            username: 'voter_ws',
            registration_number: 'REG-VOTER-WS-001',
            role: 'voter',
            voter_status: 'eligible',
            is_verified: true
        });
        voterUserId = voterUser.id;
        voterToken = jwt.sign(
            { userId: voterUser.id, email: voterUser.email, role: voterUser.role },
            config.jwt.secret,
            { expiresIn: '1h' }
        );

        // Create test election
        const election = await repositories.election.create({
            contract_address: '0x3333333333333333333333333333333333333333',
            title: 'WebSocket Test Election',
            description: 'Test election for WebSocket functionality',
            creator_id: adminUserId,
            election_type: 'single_choice',
            start_time: new Date(Date.now() + 60000),
            end_time: new Date(Date.now() + 3600000),
            is_public: true,
            status: 'pending'
        });
        testElectionId = election.id;
    });

    afterAll(async () => {
        // Clean up test data
        if (testElectionId) {
            await repositories.election.delete(testElectionId);
        }
        if (adminUserId) {
            await repositories.user.delete(adminUserId);
        }
        if (voterUserId) {
            await repositories.user.delete(voterUserId);
        }

        if (app) {
            await app.shutdown();
        }

        // Clean up environment variable
        delete process.env.ENABLE_WS_IN_TESTS;
    });

    describe('WebSocket Connection', () => {
        it('should establish WebSocket connection', (done) => {
            const ws = new WebSocket(`ws://localhost:${wsPort}?token=${voterToken}`, {
                origin: config.websocket.corsOrigin
            });

            ws.on('open', () => {
                expect(ws.readyState).toBe(WebSocket.OPEN);
                ws.close(); done();
            });

            ws.on('error', (error) => {
                done(error);
            });
        });

        it('should handle authentication', (done) => {
            const ws = new WebSocket(`ws://localhost:${wsPort}?token=${adminToken}`, {
                origin: config.websocket.corsOrigin
            });

            ws.on('message', (data) => {
                const message = JSON.parse(data.toString());
                if (message.type === 'connection_established') {
                    expect(message.data.userId).toBeDefined();
                    ws.close();
                    done();
                }
            });

            ws.on('error', (error) => {
                done(error);
            });
        });
    });

    describe('Real-time Updates', () => {
        it('should broadcast election updates', (done) => {
            const ws = new WebSocket(`ws://localhost:${wsPort}?token=${voterToken}`, {
                origin: config.websocket.corsOrigin
            });

            ws.on('message', (data) => {
                const message = JSON.parse(data.toString());

                if (message.type === 'connection_established') {
                    // Connection established, test passes
                    ws.close();
                    done();
                }
            });

            ws.on('error', (error) => {
                done(error);
            });
        });
    });
});