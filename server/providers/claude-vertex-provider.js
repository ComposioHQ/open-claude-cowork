import { ClaudeProvider } from './claude-provider.js';

/**
 * Claude via Vertex AI provider implementation.
 * Extends ClaudeProvider to route requests through Google Cloud Vertex AI
 * instead of the direct Anthropic API.
 *
 * Requires:
 *   - ANTHROPIC_VERTEX_PROJECT_ID (GCP project ID)
 *   - CLOUD_ML_REGION (GCP region, e.g. us-east5)
 *   - Google Cloud credentials (gcloud auth application-default login)
 */
export class ClaudeVertexProvider extends ClaudeProvider {
  constructor(config = {}) {
    super(config);

    this.vertexProjectId = process.env.ANTHROPIC_VERTEX_PROJECT_ID || config.vertexProjectId;
    this.vertexRegion = process.env.CLOUD_ML_REGION || config.vertexRegion || 'us-east5';
  }

  get name() {
    return 'claude-vertex';
  }

  async initialize() {
    if (!this.vertexProjectId) {
      console.warn('[Claude-Vertex] ANTHROPIC_VERTEX_PROJECT_ID not set. Vertex AI provider will fail at query time.');
    } else {
      console.log(`[Claude-Vertex] Configured for project: ${this.vertexProjectId}, region: ${this.vertexRegion}`);
    }
  }

  /**
   * Override query to inject Vertex AI environment variables.
   * The Claude Agent SDK reads these env vars to route through Vertex AI.
   */
  async *query(params) {
    if (!this.vertexProjectId) {
      yield {
        type: 'error',
        message: 'Vertex AI not configured. Set ANTHROPIC_VERTEX_PROJECT_ID and CLOUD_ML_REGION in your .env file.',
        provider: this.name
      };
      return;
    }

    // Store original env values
    const origUseVertex = process.env.CLAUDE_CODE_USE_VERTEX;
    const origProjectId = process.env.ANTHROPIC_VERTEX_PROJECT_ID;
    const origRegion = process.env.CLOUD_ML_REGION;

    try {
      // Set Vertex AI env vars for the Claude Agent SDK process
      process.env.CLAUDE_CODE_USE_VERTEX = '1';
      process.env.ANTHROPIC_VERTEX_PROJECT_ID = this.vertexProjectId;
      process.env.CLOUD_ML_REGION = this.vertexRegion;

      console.log(`[Claude-Vertex] Routing through Vertex AI (project: ${this.vertexProjectId}, region: ${this.vertexRegion})`);

      // Delegate to parent ClaudeProvider's query
      for await (const chunk of super.query(params)) {
        // Re-tag chunks with this provider's name
        if (chunk.provider) {
          chunk.provider = this.name;
        }
        yield chunk;
      }
    } finally {
      // Restore original env values
      if (origUseVertex === undefined) {
        delete process.env.CLAUDE_CODE_USE_VERTEX;
      } else {
        process.env.CLAUDE_CODE_USE_VERTEX = origUseVertex;
      }
      if (origProjectId === undefined) {
        delete process.env.ANTHROPIC_VERTEX_PROJECT_ID;
      } else {
        process.env.ANTHROPIC_VERTEX_PROJECT_ID = origProjectId;
      }
      if (origRegion === undefined) {
        delete process.env.CLOUD_ML_REGION;
      } else {
        process.env.CLOUD_ML_REGION = origRegion;
      }
    }
  }
}
