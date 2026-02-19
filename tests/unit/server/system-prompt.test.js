import { vi, describe, it, expect } from 'vitest';

vi.mock('../../../server/utils/settings-utils.js', () => ({
  readUserSettingsFile: () => ({
    instructions: {
      global: 'Be a helpful assistant.',
      folders: [
        { path: '/path/to/project', instructions: 'Use tabs for indentation.' }
      ]
    }
  })
}));

import { buildSystemPrompt } from '../../../server/utils/prompt-utils.js';

describe('buildSystemPrompt', () => {
  it('includes project context when provided', () => {
    const metadata = {
      project: { name: 'My Website', desc: 'A portfolio site' }
    };
    const prompt = buildSystemPrompt(metadata);
    expect(prompt).toContain('## Project Context');
    expect(prompt).toContain('Name: My Website');
    expect(prompt).toContain('Goal: A portfolio site');
  });

  it('includes global instructions', () => {
    const prompt = buildSystemPrompt({});
    expect(prompt).toContain('## User Instructions');
    expect(prompt).toContain('Be a helpful assistant.');
  });

  it('includes folder instructions', () => {
    const prompt = buildSystemPrompt({});
    expect(prompt).toContain('### Instructions for /path/to/project');
    expect(prompt).toContain('Use tabs for indentation.');
  });

  it('includes external content when provided', () => {
    const metadata = {
      externalContent: '## Pinned External Resources\n### Notion Page: Docs\nPage content here'
    };
    const prompt = buildSystemPrompt(metadata);
    expect(prompt).toContain('## Pinned External Resources');
    expect(prompt).toContain('Page content here');
  });
});
