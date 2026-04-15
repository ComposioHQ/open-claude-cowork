import { OpalAgent } from './base-agent.js';

/**
 * Logo Vector Generator Agent
 *
 * Generates SVG logomarks using mathematical geometry.
 * Uses text-based LLM output (not image generation) to produce
 * pure SVG code based on brand archetype and recipe.
 */
export class LogoAgent extends OpalAgent {
  constructor() {
    super('logo', 'logo-vector-system.md', {
      maxTurns: 5,
      allowedTools: [],
    });
  }

  async *run(projectId, userMessage, extraContext = {}) {
    yield* super.run(projectId, userMessage, {
      ...extraContext,
      includeIntake: true,
      includeDesignSystem: false,
    });
  }
}

let instance = null;
export function getLogoAgent() {
  if (!instance) instance = new LogoAgent();
  return instance;
}
