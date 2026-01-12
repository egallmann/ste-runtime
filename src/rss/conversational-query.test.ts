/**
 * Tests for Conversational Query
 * 
 * Tests the conversational query engine.
 */

import { describe, it, expect } from 'vitest';
import { ConversationalQueryEngine, type QueryIntent } from './conversational-query.js';

describe('Conversational Query Engine', () => {
  describe('initialization', () => {
    it('should create query engine instance', () => {
      const engine = new ConversationalQueryEngine('.ste/state');

      expect(engine).toBeDefined();
      expect(engine['initialized']).toBe(false);
    });
  });

  describe('intent classification', () => {
    it('should classify describe intent', () => {
      const engine = new ConversationalQueryEngine();
      const intent = engine['classifyIntent']('Tell me about X');
      expect(intent).toBe('describe');
    });

    it('should classify explain intent', () => {
      const engine = new ConversationalQueryEngine();
      const intent = engine['classifyIntent']('How does X work?');
      expect(intent).toBe('explain');
    });

    it('should classify list intent', () => {
      const engine = new ConversationalQueryEngine();
      const intent = engine['classifyIntent']('Show all X');
      expect(intent).toBe('list');
    });

    it('should classify relationship intent', () => {
      const engine = new ConversationalQueryEngine();
      const intent = engine['classifyIntent']('How are X and Y related?');
      expect(intent).toBe('relationship');
    });

    it('should classify impact intent', () => {
      const engine = new ConversationalQueryEngine();
      const intent = engine['classifyIntent']('What would be affected by changing X?');
      expect(intent).toBe('impact');
    });

    it('should classify dependencies intent', () => {
      const engine = new ConversationalQueryEngine();
      const intent = engine['classifyIntent']('What does X depend on?');
      expect(intent).toBe('dependencies');
    });

    it('should classify dependents intent', () => {
      const engine = new ConversationalQueryEngine();
      const intent = engine['classifyIntent']('What depends on X?');
      expect(intent).toBe('dependents');
    });

    it('should classify locate intent', () => {
      const engine = new ConversationalQueryEngine();
      const intent = engine['classifyIntent']('Where is X?');
      expect(intent).toBe('locate');
    });

    it('should handle unknown intent', () => {
      const engine = new ConversationalQueryEngine();
      const intent = engine['classifyIntent']('Random gibberish xyz');
      expect(intent).toBe('unknown');
    });
  });

  // Note: Full integration tests with actual graph initialization
  // are better suited for integration tests, not unit tests.
  // These basic tests ensure the class structure is correct.
});

