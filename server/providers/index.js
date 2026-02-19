import { ClaudeProvider } from './claude-provider.js';

// Provider registry
const providers = { claude: ClaudeProvider };

// Provider instance cache
const providerInstances = new Map();

/**
 * Get a provider instance by name
 * Instances are cached and reused
 *
 * @param {string} providerName - 'claude'
 * @param {Object} [config] - Provider configuration
 * @returns {BaseProvider} Provider instance
 */
export function getProvider(providerName, config = {}) {
  const name = providerName?.toLowerCase() || 'claude';

  if (!providers[name]) {
    throw new Error(`Unknown provider: ${name}. Available providers: ${Object.keys(providers).join(', ')}`);
  }

  // Check cache
  const cacheKey = `${name}:${JSON.stringify(config)}`;
  if (providerInstances.has(cacheKey)) {
    return providerInstances.get(cacheKey);
  }

  // Create new instance
  const ProviderClass = providers[name];
  const instance = new ProviderClass(config);
  providerInstances.set(cacheKey, instance);

  return instance;
}

/**
 * Get list of available provider names
 * @returns {string[]}
 */
export function getAvailableProviders() {
  return Object.keys(providers);
}

/**
 * Register a custom provider
 * @param {string} name - Provider name
 * @param {typeof BaseProvider} ProviderClass - Provider class
 */
export function registerProvider(name, ProviderClass) {
  providers[name.toLowerCase()] = ProviderClass;
}

/**
 * Clear provider instance cache
 */
export async function clearProviderCache() {
  for (const instance of providerInstances.values()) {
    if (instance.cleanup) {
      await instance.cleanup();
    }
  }
  providerInstances.clear();
}

export async function initializeProviders() {
  console.log('[Providers] Initializing providers...');
  try {
    const claudeProvider = getProvider('claude');
    if (typeof claudeProvider.initialize === 'function') {
      await claudeProvider.initialize();
    }
    console.log('[Providers] Claude provider initialized');
  } catch (error) {
    console.error('[Providers] Error initializing providers:', error.message);
  }
}

// Export classes for direct use
export { ClaudeProvider } from './claude-provider.js';
export { BaseProvider } from './base-provider.js';
