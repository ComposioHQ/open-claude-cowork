import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock provider classes BEFORE importing the module under test
const mockClaudeCleanup = vi.fn();

vi.mock('../../../../server/providers/claude-provider.js', () => {
  class MockClaudeProvider {
    constructor(config) {
      this.config = config;
      this.providerName = 'claude';
    }
    get name() { return 'claude'; }
    async cleanup() { mockClaudeCleanup(); }
  }
  return { ClaudeProvider: MockClaudeProvider };
});

// Mock base-provider (re-exported by index.js)
vi.mock('../../../../server/providers/base-provider.js', () => {
  class MockBaseProvider {
    constructor(config) { this.config = config; }
  }
  return { BaseProvider: MockBaseProvider };
});

// Mock session-store (transitive dep of base-provider)
vi.mock('../../../../server/supabase/session-store.js', () => ({
  getProviderSession: vi.fn()
}));

// Import module under test AFTER mocks
const {
  getProvider,
  getAvailableProviders,
  registerProvider,
  clearProviderCache,
  initializeProviders
} = await import('../../../../server/providers/index.js');

describe('providers/index', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    // Clear the provider cache between tests to avoid state leaking
    await clearProviderCache();
  });

  describe('getProvider()', () => {
    it('returns a ClaudeProvider instance for "claude"', () => {
      const provider = getProvider('claude');
      expect(provider.providerName).toBe('claude');
    });

    it('is case-insensitive', () => {
      const upper = getProvider('CLAUDE');
      expect(upper.providerName).toBe('claude');
    });

    it('defaults to "claude" when providerName is null or undefined', () => {
      const provider = getProvider(null);
      expect(provider.providerName).toBe('claude');

      // Clear cache to test undefined too
      clearProviderCache();
      const provider2 = getProvider(undefined);
      expect(provider2.providerName).toBe('claude');
    });

    it('caches instances (singleton per name+config)', () => {
      const first = getProvider('claude');
      const second = getProvider('claude');
      expect(first).toBe(second);
    });

    it('returns different instances for different configs', () => {
      const a = getProvider('claude', { maxTurns: 10 });
      const b = getProvider('claude', { maxTurns: 50 });
      expect(a).not.toBe(b);
    });

    it('passes config to the provider constructor', () => {
      const config = { maxTurns: 30, allowedTools: ['Read'] };
      const provider = getProvider('claude', config);
      expect(provider.config).toEqual(config);
    });

    it('throws for unknown provider name', () => {
      expect(() => getProvider('gpt')).toThrow('Unknown provider: gpt');
    });

    it('includes available providers in the error message', () => {
      expect(() => getProvider('invalid')).toThrow(/claude/);
    });
  });

  describe('getAvailableProviders()', () => {
    it('returns array containing only "claude" by default', () => {
      expect(getAvailableProviders()).toEqual(['claude']);
    });
  });

  describe('registerProvider()', () => {
    it('adds a new provider to the registry', () => {
      class CustomProvider {
        get name() { return 'custom'; }
      }
      registerProvider('custom', CustomProvider);

      expect(getAvailableProviders()).toContain('custom');
    });

    it('allows getting the registered provider', () => {
      class AnotherProvider {
        constructor(config) { this.config = config; this.providerName = 'another'; }
        get name() { return 'another'; }
      }
      registerProvider('another', AnotherProvider);

      const instance = getProvider('another');
      expect(instance.providerName).toBe('another');
    });

    it('lowercases the provider name', () => {
      class UpperProvider {
        constructor() { this.providerName = 'upper'; }
        get name() { return 'upper'; }
      }
      registerProvider('UPPER', UpperProvider);

      expect(getAvailableProviders()).toContain('upper');
    });
  });

  describe('clearProviderCache()', () => {
    it('calls cleanup on cached provider instances', async () => {
      // Create instances to populate the cache
      getProvider('claude');

      await clearProviderCache();

      expect(mockClaudeCleanup).toHaveBeenCalled();
    });

    it('clears the cache so new instances are created on next getProvider()', async () => {
      const first = getProvider('claude');
      await clearProviderCache();
      const second = getProvider('claude');

      // They should be different objects since cache was cleared
      expect(first).not.toBe(second);
    });

    it('does not throw when cache is empty', async () => {
      await expect(clearProviderCache()).resolves.toBeUndefined();
    });
  });

  describe('initializeProviders()', () => {
    it('does not throw when initialization is called', async () => {
      await initializeProviders();
      expect(true).toBe(true);
    });
  });
});
