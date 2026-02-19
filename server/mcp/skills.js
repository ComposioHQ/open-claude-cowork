import { createSdkMcpServer, tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import * as userSkills from '../managers/user-skills-manager.js';

/**
 * Create an MCP server exposing user skill CRUD tools so the agent can save and manage workflows.
 * @returns {object} SDK MCP server
 */
export function createSkillsMcpServer() {
  return createSdkMcpServer({
    name: 'skills',
    version: '1.0.0',
    tools: [
      tool(
        'skill_create',
        'Create a new user skill (saved workflow). Use after the user confirms they want to save a workflow. Store clear step-by-step instructions in Markdown.',
        {
          name: z.string().describe('Short name for the skill (e.g. Weather Check, Weekly Summary)'),
          content: z.string().describe('Markdown content: steps, tools to use, and any parameters')
        },
        async (args) => {
          try {
            const result = userSkills.createSkill(args.name, args.content);
            return {
              content: [{ type: 'text', text: JSON.stringify({ success: true, skill: result.name, message: `Skill "${result.name}" created.` }, null, 2) }]
            };
          } catch (err) {
            return {
              content: [{ type: 'text', text: JSON.stringify({ success: false, error: err.message }) }]
            };
          }
        }
      ),
      tool(
        'skill_list',
        'List all saved user skills (workflows).',
        {},
        async () => {
          try {
            const list = userSkills.listSkills();
            return {
              content: [{ type: 'text', text: JSON.stringify({ skills: list }, null, 2) }]
            };
          } catch (err) {
            return {
              content: [{ type: 'text', text: JSON.stringify({ success: false, error: err.message }) }]
            };
          }
        }
      ),
      tool(
        'skill_read',
        'Read the content of a saved skill by name.',
        {
          name: z.string().describe('Skill name (e.g. Weather Check or weather-check)')
        },
        async (args) => {
          try {
            const content = userSkills.readSkill(args.name);
            if (content === null) {
              return {
                content: [{ type: 'text', text: JSON.stringify({ found: false, error: 'Skill not found' }) }]
              };
            }
            return {
              content: [{ type: 'text', text: JSON.stringify({ found: true, content }) }]
            };
          } catch (err) {
            return {
              content: [{ type: 'text', text: JSON.stringify({ success: false, error: err.message }) }]
            };
          }
        }
      ),
      tool(
        'skill_update',
        'Update an existing skill\'s Markdown content.',
        {
          name: z.string().describe('Skill name to update'),
          content: z.string().describe('New Markdown content')
        },
        async (args) => {
          try {
            const ok = userSkills.updateSkill(args.name, args.content);
            return {
              content: [{ type: 'text', text: JSON.stringify({ success: ok, message: ok ? 'Skill updated.' : 'Skill not found.' }) }]
            };
          } catch (err) {
            return {
              content: [{ type: 'text', text: JSON.stringify({ success: false, error: err.message }) }]
            };
          }
        }
      ),
      tool(
        'skill_delete',
        'Delete a saved skill by name.',
        {
          name: z.string().describe('Skill name to delete')
        },
        async (args) => {
          try {
            const ok = userSkills.deleteSkill(args.name);
            return {
              content: [{ type: 'text', text: JSON.stringify({ success: ok, message: ok ? 'Skill deleted.' : 'Skill not found.' }) }]
            };
          } catch (err) {
            return {
              content: [{ type: 'text', text: JSON.stringify({ success: false, error: err.message }) }]
            };
          }
        }
      )
    ]
  });
}
