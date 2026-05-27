// Jest setup file
/// <reference types="jest" />
import dotenv from 'dotenv';
import { resolve } from 'path';

// Load test-specific environment variables before test modules import config.
dotenv.config({ path: resolve(__dirname, '../../.env.test') });

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'error';
process.env.REDIS_HOST = 'disabled';

// Use a random WS port per Jest run to avoid clashes with local running services.
const basePort = parseInt(process.env.TEST_WS_BASE_PORT || '4200', 10);
const randomOffset = Math.floor(Math.random() * 2000);
process.env.WS_PORT = String(basePort + randomOffset);

// Set test timeout for comprehensive tests
if (typeof jest !== 'undefined') {
  jest.setTimeout(60000);
}

// Track WebSocket instances for cleanup
const activeWebSocketServers: any[] = [];

// Global test cleanup
afterAll(async () => {
  for (const server of activeWebSocketServers) {
    try {
      if (server && typeof server.close === 'function') {
        server.close();
      }
    } catch (error) {
      // Ignore cleanup errors
    }
  }

  if (global.gc) {
    global.gc();
  }

  await new Promise(resolve => setTimeout(resolve, 100));
});

// Export helper for tracking WebSocket servers
export const trackWebSocketServer = (server: any) => {
  activeWebSocketServers.push(server);
};
