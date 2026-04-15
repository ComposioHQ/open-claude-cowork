import { OpalAgent } from './base-agent.js';

export class VoiceAgent extends OpalAgent {
  constructor() {
    super('voice', 'voice-system.md', { maxTurns: 5, allowedTools: [] });
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
export function getVoiceAgent() {
  if (!instance) instance = new VoiceAgent();
  return instance;
}
