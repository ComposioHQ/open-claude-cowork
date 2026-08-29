import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ClaudeProvider } from './claude-provider.js';

const PROJECT_ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..'
);

test('loads project Skills from the repository root', async () => {
  let request;
  const queryClient = async function* (value) {
    request = value;
    yield { type: 'result', result: 'ok' };
  };
  const provider = new ClaudeProvider({ queryClient });

  const chunks = [];
  for await (const chunk of provider.query({
    prompt: 'Search public X posts about open source.',
    chatId: 'test-chat'
  })) {
    chunks.push(chunk);
  }

  assert.equal(request.options.cwd, PROJECT_ROOT);
  assert.deepEqual(request.options.settingSources, ['user', 'project']);
  await access(path.join(
    request.options.cwd,
    '.claude',
    'skills',
    'xquik-tweet-search',
    'SKILL.md'
  ));
  assert.equal(chunks.at(-1).type, 'done');
});
