import { OpalAgent } from './base-agent.js';

export class CreativeDirectorAgent extends OpalAgent {
  constructor() {
    super('cd', 'cd-system.md', { maxTurns: 10, allowedTools: [] });
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
export function getCreativeDirectorAgent() {
  if (!instance) instance = new CreativeDirectorAgent();
  return instance;
}
