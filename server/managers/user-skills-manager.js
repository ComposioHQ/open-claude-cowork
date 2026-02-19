/**
 * User Skills Manager — CRUD for user-defined workflow/skill Markdown files.
 * Skills are stored in server/data/user-skills/ and injected into the system prompt.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SKILLS_DIR = path.join(__dirname, '..', 'data', 'user-skills');

function ensureDir() {
  if (!fs.existsSync(SKILLS_DIR)) {
    fs.mkdirSync(SKILLS_DIR, { recursive: true });
  }
}

/**
 * Sanitize skill name for use as filename (alphanumeric, dash, underscore).
 * @param {string} name
 * @returns {string}
 */
function sanitizeName(name) {
  if (!name || typeof name !== 'string') return '';
  return name
    .replace(/[^a-zA-Z0-9_\s-]/g, '')
    .replace(/\s+/g, '-')
    .trim()
    .toLowerCase() || 'unnamed';
}

/**
 * Resolve path to skill file (no traversal).
 * @param {string} name - Sanitized skill name
 * @returns {string}
 */
function skillPath(name) {
  const base = sanitizeName(name) || 'unnamed';
  const filePath = path.join(SKILLS_DIR, `${base}.md`);
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(path.resolve(SKILLS_DIR))) {
    throw new Error('Invalid skill name');
  }
  return resolved;
}

/**
 * @param {string} name - Display name for the skill
 * @param {string} content - Markdown content
 * @returns {{ path: string, name: string }}
 */
export function createSkill(name, content) {
  ensureDir();
  const base = sanitizeName(name) || 'unnamed';
  const filePath = path.join(SKILLS_DIR, `${base}.md`);
  const body = typeof content === 'string' ? content.trim() : '';
  fs.writeFileSync(filePath, body, 'utf8');
  return { path: filePath, name: base };
}

/**
 * @returns {Array<{ name: string, filename: string }>}
 */
export function listSkills() {
  ensureDir();
  const files = fs.readdirSync(SKILLS_DIR);
  return files
    .filter((f) => f.endsWith('.md'))
    .map((f) => ({
      name: f.replace(/\.md$/, '').replace(/-/g, ' '),
      filename: f
    }));
}

/**
 * @param {string} name - Skill name (will be sanitized for lookup)
 * @returns {string|null} Content or null if not found
 */
export function readSkill(name) {
  ensureDir();
  try {
    const p = skillPath(name);
    if (!fs.existsSync(p)) return null;
    return fs.readFileSync(p, 'utf8').trim();
  } catch {
    return null;
  }
}

/**
 * @param {string} name - Skill name
 * @param {string} content - New Markdown content
 * @returns {boolean} True if updated
 */
export function updateSkill(name, content) {
  ensureDir();
  try {
    const p = skillPath(name);
    if (!fs.existsSync(p)) return false;
    const body = typeof content === 'string' ? content.trim() : '';
    fs.writeFileSync(p, body, 'utf8');
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} name - Skill name
 * @returns {boolean} True if deleted
 */
export function deleteSkill(name) {
  ensureDir();
  try {
    const p = skillPath(name);
    if (!fs.existsSync(p)) return false;
    fs.unlinkSync(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Format all user skills for injection into the system prompt.
 * @returns {string}
 */
export function getSystemPromptAdditions() {
  ensureDir();
  const list = listSkills();
  if (!list.length) return '';
  const parts = [];
  for (const { name, filename } of list) {
    const fullPath = path.join(SKILLS_DIR, filename);
    try {
      const content = fs.readFileSync(fullPath, 'utf8').trim();
      if (content) {
        const displayName = name.replace(/-/g, ' ');
        parts.push(`# User Skill: ${displayName}\n${content}`);
      }
    } catch (err) {
      console.error('[UserSkills] Failed to read skill:', filename, err.message);
    }
  }
  return parts.join('\n\n');
}
