import { OpalAgent } from './base-agent.js';

export class ContentStrategyAgent extends OpalAgent {
  constructor() {
    super('csa', 'content-system.md', { maxTurns: 10, allowedTools: [] });
  }

  async *run(projectId, userMessage, extraContext = {}) {
    yield* super.run(projectId, userMessage, {
      ...extraContext,
      includeIntake: true,
      includeDesignSystem: true,
    });
  }
}

let instance = null;
export function getContentStrategyAgent() {
  if (!instance) instance = new ContentStrategyAgent();
  return instance;
}
