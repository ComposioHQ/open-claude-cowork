import { OpalAgent } from './base-agent.js';

/**
 * Account Director Agent (ADA)
 *
 * Conducts the dynamic brand intake interview for Stage 1.
 * Conversationally extracts 42 questions across 8 sections,
 * with emphasis on the gate-critical sections C1 (Audience DNA)
 * and H (Competitors).
 */
export class AdaAgent extends OpalAgent {
  constructor() {
    super('ada', 'ada-system.md', {
      maxTurns: 5,
      allowedTools: [],
    });
  }

  /**
   * Run the ADA interview agent.
   * Wraps the base run() with intake-specific context.
   */
  async *run(projectId, userMessage, extraContext = {}) {
    yield* super.run(projectId, userMessage, {
      ...extraContext,
      includeIntake: true,        // Include existing intake data so ADA knows what's been answered
      includeDesignSystem: false,  // Not relevant at Stage 1
    });
  }
}

// Singleton instance
let instance = null;

export function getAdaAgent() {
  if (!instance) {
    instance = new AdaAgent();
  }
  return instance;
}
