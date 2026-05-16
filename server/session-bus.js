import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = process.env.COWORK_DATA_DIR || path.join(__dirname, 'data');
const STORE_PATH = path.join(DATA_DIR, 'session-bus.jsonl');
const BROADCAST_CHAT_ID = '*';

const ALLOWED_STATUSES = new Set(['unread', 'read']);
const ALLOWED_KINDS = new Set(['note', 'summary', 'request', 'context']);
const HIGH_RISK_RE = /\b(delete|remove|drop|deploy|restart|credential|secret|password|token|external send|production|prod)\b|ลบ|ลบทิ้ง|ล้าง|ดีพลอย|deploy|รีสตาร์ท|restart|โปรดักชัน|โปรดักชั่น|production|รหัสผ่าน|โทเคน|token|secret|credential/i;
const MEDIUM_RISK_RE = /\b(change|patch|fix|test|refactor|review|merge|edit|write)\b|แก้|เปลี่ยน|ทดสอบ|รีแฟคเตอร์|รวมโค้ด|merge|เขียนไฟล์|แก้ไฟล์/i;

function ensureStore() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, '', 'utf8');
  }
}

function parseLine(line) {
  if (!line.trim()) return null;
  try {
    return JSON.parse(line);
  } catch (_err) {
    return null;
  }
}

function readAllMessages() {
  ensureStore();
  const content = fs.readFileSync(STORE_PATH, 'utf8');
  if (!content.trim()) return [];

  return content
    .split('\n')
    .map(parseLine)
    .filter(Boolean);
}

function rewriteAllMessages(messages) {
  ensureStore();
  const lines = messages.map((msg) => JSON.stringify(msg));
  const body = lines.length > 0 ? `${lines.join('\n')}\n` : '';
  fs.writeFileSync(STORE_PATH, body, 'utf8');
}

function classifyRisk(content = '') {
  if (HIGH_RISK_RE.test(content)) return 'high';
  if (MEDIUM_RISK_RE.test(content)) return 'medium';
  return 'low';
}

function normalizeKind(kind) {
  if (!kind) return 'note';
  const lowered = String(kind).toLowerCase();
  return ALLOWED_KINDS.has(lowered) ? lowered : 'note';
}

function normalizeStatus(status) {
  if (!status) return null;
  const lowered = String(status).toLowerCase();
  return ALLOWED_STATUSES.has(lowered) ? lowered : null;
}

function requireField(value, fieldName) {
  if (!value || !String(value).trim()) {
    throw new Error(`${fieldName} is required`);
  }
}

export function listMessages({
  chatId,
  status,
  includeBroadcast = false,
  excludeFromChatId = null,
  limit = 0
} = {}) {
  requireField(chatId, 'chatId');
  const normalizedStatus = normalizeStatus(status);
  const numericLimit = Number(limit || 0);

  const all = readAllMessages();
  const filtered = all
    .filter((msg) => {
      if (msg.toChatId === chatId) return true;
      if (includeBroadcast && msg.toChatId === BROADCAST_CHAT_ID) return true;
      return false;
    })
    .filter((msg) => (excludeFromChatId ? msg.fromChatId !== excludeFromChatId : true))
    .filter((msg) => (normalizedStatus ? msg.status === normalizedStatus : true))
    .sort((a, b) => b.createdAt - a.createdAt);

  if (numericLimit > 0) {
    return filtered.slice(0, numericLimit);
  }
  return filtered;
}

export function createMessage({
  fromChatId,
  fromTitle,
  toChatId,
  toTitle,
  content,
  kind = 'note',
  sourceMessageId = null
} = {}) {
  requireField(fromChatId, 'fromChatId');
  requireField(toChatId, 'toChatId');
  requireField(content, 'content');

  const now = Date.now();
  const message = {
    id: `msg_${now}_${crypto.randomBytes(4).toString('hex')}`,
    createdAt: now,
    fromChatId,
    fromTitle: fromTitle || fromChatId,
    toChatId,
    toTitle: toTitle || toChatId,
    kind: normalizeKind(kind),
    status: 'unread',
    content: String(content).trim(),
    sourceMessageId,
    risk: classifyRisk(content)
  };

  ensureStore();
  fs.appendFileSync(STORE_PATH, `${JSON.stringify(message)}\n`, 'utf8');
  return message;
}

export function markRead({ messageId } = {}) {
  requireField(messageId, 'messageId');

  const all = readAllMessages();
  const index = all.findIndex((msg) => msg.id === messageId);
  if (index === -1) {
    throw new Error('message not found');
  }

  if (all[index].status !== 'read') {
    all[index] = {
      ...all[index],
      status: 'read',
      readAt: Date.now()
    };
    rewriteAllMessages(all);
  }

  return all[index];
}

export function getUnreadCount({ chatId } = {}) {
  requireField(chatId, 'chatId');
  return listMessages({
    chatId,
    status: 'unread',
    includeBroadcast: true,
    excludeFromChatId: chatId
  }).length;
}
