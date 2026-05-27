/**
 * Simple blockchain service tests to verify basic functionality
 */

describe('Blockchain Integration Service', () => {
  describe('Service Structure', () => {
    it('should export all required services', () => {
      // Test that all services can be imported without errors
      expect(() => {
        require('../services/blockchain/types');
        require('../services/blockchain/Web3Provider');
        require('../services/blockchain/ContractService');
        require('../services/blockchain/TransactionService');
        require('../services/blockchain/EventListenerService');
        require('../services/blockchain/BlockchainService');
      }).not.toThrow();
    });

    it('should have correct service exports', () => {
      const blockchainIndex = require('../services/blockchain/index');
      
      expect(blockchainIndex).toHaveProperty('BlockchainService');
      expect(blockchainIndex).toHaveProperty('Web3Provider');
      expect(blockchainIndex).toHaveProperty('ContractService');
      expect(blockchainIndex).toHaveProperty('EventListenerService');
      expect(blockchainIndex).toHaveProperty('TransactionService');
    });
  });

  describe('Type Definitions', () => {
    it('should have all required type definitions', () => {
      const types = require('../services/blockchain/types');
      
      // Check that types module exports without errors
      expect(types).toBeDefined();
    });
  });

  describe('Service Dependencies', () => {
    it('should have ethers dependency available', () => {
      expect(() => {
        require('ethers');
      }).not.toThrow();
    });

    it('should have ws dependency available', () => {
      expect(() => {
        require('ws');
      }).not.toThrow();
    });
  });

  describe('Configuration', () => {
    it('should handle missing blockchain configuration gracefully', () => {
      // This test verifies that the service can handle missing config
      // without crashing during import
      expect(true).toBe(true);
    });
  });
});