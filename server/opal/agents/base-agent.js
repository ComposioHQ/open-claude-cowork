import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getProvider } from '../../providers/index.js';
import { getVoiceAnchor, getDesignSystem, getIntakeAnswers } from '../database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * OpalAgent - Base class for all OPAL pipeline agents.
 *
 * Wraps the existing ClaudeProvider with:
 * - Specialized system prompts loaded from .md files
 * - Automatic voice anchor injection (after Stage 4)
 * - Project context enrichment (intake data, design system)
 * - Scoped chat sessions (project_id + agent_type)
 */
export class OpalAgent {
  constructor(agentType, systemPromptFile, options = {}) {
    this.agentType = agentType;
    this.provider = getProvider('claude');
    this.maxTurns = options.maxTurns || 10;
    this.allowedTools = options.allowedTools || [];

    // Load system prompt from file
    const promptPath = path.join(__dirname, '..', 'prompts', systemPromptFile);
    if (fs.existsSync(promptPath)) {
      this.systemPrompt = fs.readFileSync(promptPath, 'utf-8');
    } else {
      console.warn(`[OpalAgent:${agentType}] System prompt not found: ${promptPath}`);
      this.systemPrompt = '';
    }
  }

  /**
   * Build the enriched prompt with project context and voice anchor.
   */
  buildPrompt(userMessage, projectId, extraContext = {}) {
    const parts = [];

    // System prompt
    if (this.systemPrompt) {
      parts.push(`<system_context>\n${this.systemPrompt}\n</system_context>`);
    }

    // Voice anchor injection (available after Stage 4)
    const voiceYaml = getVoiceAnchor(projectId);
    if (voiceYaml) {
      parts.push(`<brand_voice_anchor>\n${voiceYaml}\n</brand_voice_anchor>`);
    }

    // Inject project context if relevant
    if (extraContext.includeIntake !== false) {
      try {
        const intake = getIntakeAnswers(projectId);
        if (Object.keys(intake).length > 0) {
          parts.push(`<brand_intake_data>\n${JSON.stringify(intake, null, 2)}\n</brand_intake_data>`);
        }
      } catch (_) { /* intake may not exist yet */ }
    }

    if (extraContext.includeDesignSystem) {
      try {
        const ds = getDesignSystem(projectId);
        if (ds) {
          parts.push(`<design_system>\n${JSON.stringify(ds, null, 2)}\n</design_system>`);
        }
      } catch (_) { /* design system may not exist yet */ }
    }

    // Extra context passed by caller
    if (extraContext.additional) {
      parts.push(extraContext.additional);
    }

    // User message
    parts.push(userMessage);

    return parts.join('\n\n');
  }

  /**
   * Run the agent and stream responses.
   *
   * @param {string} projectId - The OPAL project ID
   * @param {string} userMessage - The user's message/prompt
   * @param {Object} extraContext - Additional context to inject
   * @yields {Object} Streaming response chunks from ClaudeProvider
   */
  async *run(projectId, userMessage, extraContext = {}) {
    const enrichedPrompt = this.buildPrompt(userMessage, projectId, extraContext);

    // Scoped chatId: opal_{projectId}_{agentType}
    const chatId = `opal_${projectId}_${this.agentType}`;

    console.log(`[OpalAgent:${this.agentType}] Running for project ${projectId}`);
    console.log(`[OpalAgent:${this.agentType}] Chat ID: ${chatId}`);

    for await (const chunk of this.provider.query({
      prompt: enrichedPrompt,
      chatId,
      mcpServers: {},
      allowedTools: this.allowedTools,
      maxTurns: this.maxTurns,
    })) {
      yield chunk;
    }
  }

  /**
   * Abort a running agent query.
   */
  abort(projectId) {
    const chatId = `opal_${projectId}_${this.agentType}`;
    return this.provider.abort(chatId);
  }
}
