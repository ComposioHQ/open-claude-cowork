import { OpalAgent } from './base-agent.js';

/**
 * Craft Critic Agent
 *
 * Evaluates SVG logomarks against 4 quality criteria:
 * Gestalt Cohesion, Responsiveness, Motion Readiness, Structural Integrity.
 */
export class CraftCriticAgent extends OpalAgent {
  constructor() {
    super('craft_critic', 'craft-critic-system.md', {
      maxTurns: 3,
      allowedTools: [],
    });
  }

  async *run(projectId, svgCode, extraContext = {}) {
    const prompt = `Please evaluate the following SVG logomark:\n\n\`\`\`svg\n${svgCode}\n\`\`\``;
    yield* super.run(projectId, prompt, {
      ...extraContext,
      includeIntake: true,
      includeDesignSystem: false,
    });
  }
}

let instance = null;
export function getCraftCriticAgent() {
  if (!instance) instance = new CraftCriticAgent();
  return instance;
}
