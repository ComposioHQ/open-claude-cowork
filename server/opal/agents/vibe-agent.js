import { OpalAgent } from './base-agent.js';

export class VibeAgent extends OpalAgent {
  constructor() {
    super('vibe', 'vibe-system.md', { maxTurns: 5, allowedTools: [] });
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
export function getVibeAgent() {
  if (!instance) instance = new VibeAgent();
  return instance;
}
