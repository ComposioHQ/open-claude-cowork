import fs from 'fs';
import os from 'os';
import path from 'path';

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cowork-lane-smoke-'));
process.env.COWORK_DATA_DIR = tmpDir;

const sessionBus = await import('../server/session-bus.js');
const codexHandoff = await import('../server/codex-handoff.js');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

try {
  const note = sessionBus.createMessage({
    fromChatId: 'chat_a',
    fromTitle: 'Chat A',
    toChatId: 'chat_b',
    toTitle: 'Chat B',
    content: 'Smoke context note',
    kind: 'context'
  });

  assert(note.id, 'session bus did not create note id');
  assert(note.status === 'unread', 'new note should be unread');
  assert(note.risk === 'low', 'safe context note should be low risk');

  const inbox = sessionBus.listMessages({ chatId: 'chat_b', status: 'unread' });
  assert(inbox.length === 1, 'target inbox should have one unread note');

  const unreadCount = sessionBus.getUnreadCount({ chatId: 'chat_b' });
  assert(unreadCount === 1, 'unread count should be 1');

  const readNote = sessionBus.markRead({ messageId: note.id });
  assert(readNote.status === 'read', 'markRead should set status read');

  const risky = sessionBus.createMessage({
    fromChatId: 'chat_a',
    toChatId: 'chat_b',
    content: 'ช่วยลบไฟล์ production token',
    kind: 'context'
  });
  assert(risky.risk === 'high', 'Thai/English destructive text should classify as high risk');

  const handoff = codexHandoff.createHandoff({
    fromChatId: 'chat_a',
    fromTitle: 'Cowork Smoke Chat',
    goal: 'Smoke test only. Do not edit files.',
    repoPath: '/tmp/cowork-smoke',
    context: 'User: verify Codex handoff lane',
    constraints: 'No file changes. No commit.'
  });

  assert(handoff.id?.startsWith('codex_'), 'handoff id should start with codex_');
  assert(fs.existsSync(handoff.promptPath), 'handoff prompt file should exist');

  const prompt = fs.readFileSync(handoff.promptPath, 'utf8');
  assert(prompt.includes('/api/codex/handoffs/'), 'prompt should include completion API curl');
  assert(prompt.includes('Smoke test only'), 'prompt should include goal');

  const handoffs = codexHandoff.listHandoffs({ chatId: 'chat_a' });
  assert(handoffs.length === 1, 'listHandoffs should return created handoff');

  const completed = codexHandoff.completeHandoff({
    handoffId: handoff.id,
    summary: 'Smoke completed',
    filesChanged: [],
    testsRun: ['smoke-session-bus-handoff.mjs'],
    blockers: [],
    nextSteps: ['Run full Electron UI smoke before push']
  });

  assert(completed.handoff.status === 'completed', 'handoff should be completed');
  assert(completed.message.toChatId === 'chat_a', 'completion report should route back to source chat');

  console.log(JSON.stringify({
    ok: true,
    tmpDir,
    checks: [
      'session bus create/list/unread/mark-read',
      'Thai+English high-risk classifier',
      'Codex handoff prompt file generation',
      'Codex completion report routed back to Cowork inbox'
    ],
    handoffId: handoff.id,
    promptPath: handoff.promptPath
  }, null, 2));
} finally {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}
