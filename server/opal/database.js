import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'opal.db');

let db = null;

/**
 * Initialize the SQLite database with all OPAL tables.
 * Creates the data directory and database file if they don't exist.
 */
export function initDatabase() {
  // Ensure data directory exists
  fs.mkdirSync(DATA_DIR, { recursive: true });

  db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent read performance
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // Create all tables in a single transaction
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        covenant_agreed_at TEXT,
        covenant_identity TEXT
      );

      CREATE TABLE IF NOT EXISTS pipeline_state (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        stage INTEGER NOT NULL,
        node TEXT,
        status TEXT NOT NULL DEFAULT 'locked',
        started_at TEXT,
        completed_at TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        UNIQUE(project_id, stage)
      );

      CREATE TABLE IF NOT EXISTS intake_answers (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        section TEXT NOT NULL,
        key TEXT NOT NULL,
        value_json TEXT,
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
        UNIQUE(project_id, section, key)
      );

      CREATE TABLE IF NOT EXISTS vault_assets (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL,
        type TEXT NOT NULL,
        stage INTEGER NOT NULL,
        filename TEXT NOT NULL,
        path TEXT NOT NULL,
        metadata_json TEXT DEFAULT '{}',
        approved INTEGER DEFAULT 0,
        version INTEGER DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS design_system (
        project_id TEXT PRIMARY KEY,
        tokens_json TEXT DEFAULT '{}',
        typography_json TEXT DEFAULT '{}',
        colors_json TEXT DEFAULT '{}',
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS voice_anchor (
        project_id TEXT PRIMARY KEY,
        yaml_content TEXT NOT NULL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS approvals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        stage INTEGER NOT NULL,
        node TEXT,
        approved_by TEXT,
        approved INTEGER NOT NULL DEFAULT 1,
        notes TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS content_calendar (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL,
        layer TEXT NOT NULL,
        data_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
      );
    `);
  })();

  console.log('[OPAL DB] Database initialized at', DB_PATH);
  return db;
}

/**
 * Get the database instance. Must call initDatabase() first.
 */
export function getDb() {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase() first.');
  }
  return db;
}

// --- Project Operations ---

export function createProject(id, name) {
  const stmt = getDb().prepare(
    'INSERT INTO projects (id, name) VALUES (?, ?)'
  );
  stmt.run(id, name);

  // Initialize pipeline stages (0-6), Stage 0 starts as 'active', rest 'locked'
  const insertStage = getDb().prepare(
    'INSERT INTO pipeline_state (project_id, stage, status) VALUES (?, ?, ?)'
  );
  const initStages = getDb().transaction(() => {
    for (let i = 0; i <= 6; i++) {
      insertStage.run(id, i, i === 0 ? 'active' : 'locked');
    }
  });
  initStages();

  return getProject(id);
}

export function getProject(id) {
  const project = getDb().prepare('SELECT * FROM projects WHERE id = ?').get(id);
  if (!project) return null;

  const stages = getDb().prepare(
    'SELECT * FROM pipeline_state WHERE project_id = ? ORDER BY stage ASC'
  ).all(id);

  return { ...project, stages };
}

export function listProjects() {
  const projects = getDb().prepare(
    'SELECT * FROM projects ORDER BY created_at DESC'
  ).all();

  return projects.map(p => {
    const stages = getDb().prepare(
      'SELECT stage, status FROM pipeline_state WHERE project_id = ? ORDER BY stage ASC'
    ).all(p.id);
    return { ...p, stages };
  });
}

// --- Pipeline State Operations ---

export function getStageState(projectId, stage) {
  return getDb().prepare(
    'SELECT * FROM pipeline_state WHERE project_id = ? AND stage = ?'
  ).get(projectId, stage);
}

export function updateStageStatus(projectId, stage, status, node = null) {
  const now = new Date().toISOString();
  const updates = { status, node };

  if (status === 'active' || status === 'generating') {
    updates.started_at = now;
  }
  if (status === 'completed') {
    updates.completed_at = now;
  }

  getDb().prepare(`
    UPDATE pipeline_state
    SET status = ?, node = ?,
        started_at = COALESCE(?, started_at),
        completed_at = COALESCE(?, completed_at)
    WHERE project_id = ? AND stage = ?
  `).run(
    updates.status,
    updates.node,
    updates.started_at || null,
    updates.completed_at || null,
    projectId,
    stage
  );

  // Update project's updated_at
  getDb().prepare(
    'UPDATE projects SET updated_at = ? WHERE id = ?'
  ).run(now, projectId);
}

// --- Covenant Operations ---

export function agreeCovenant(projectId, identity) {
  const now = new Date().toISOString();

  getDb().prepare(`
    UPDATE projects SET covenant_agreed_at = ?, covenant_identity = ?, updated_at = ?
    WHERE id = ?
  `).run(now, identity, now, projectId);

  // Log approval
  getDb().prepare(`
    INSERT INTO approvals (project_id, stage, node, approved_by, approved, notes)
    VALUES (?, 0, 'covenant', ?, 1, 'Covenant agreement accepted')
  `).run(projectId, identity);

  // Mark Stage 0 complete, Stage 1 active
  updateStageStatus(projectId, 0, 'completed');
  updateStageStatus(projectId, 1, 'active');
}

// --- Intake Operations ---

export function setIntakeAnswer(projectId, section, key, value) {
  getDb().prepare(`
    INSERT INTO intake_answers (project_id, section, key, value_json)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(project_id, section, key)
    DO UPDATE SET value_json = excluded.value_json
  `).run(projectId, section, key, JSON.stringify(value));
}

export function getIntakeAnswers(projectId) {
  const rows = getDb().prepare(
    'SELECT section, key, value_json FROM intake_answers WHERE project_id = ?'
  ).all(projectId);

  const answers = {};
  for (const row of rows) {
    if (!answers[row.section]) answers[row.section] = {};
    answers[row.section][row.key] = JSON.parse(row.value_json);
  }
  return answers;
}

// --- Design System Operations ---

export function setDesignSystem(projectId, tokens, typography, colors) {
  getDb().prepare(`
    INSERT INTO design_system (project_id, tokens_json, typography_json, colors_json, updated_at)
    VALUES (?, ?, ?, ?, datetime('now'))
    ON CONFLICT(project_id)
    DO UPDATE SET tokens_json = excluded.tokens_json,
                  typography_json = excluded.typography_json,
                  colors_json = excluded.colors_json,
                  updated_at = datetime('now')
  `).run(
    projectId,
    JSON.stringify(tokens),
    JSON.stringify(typography),
    JSON.stringify(colors)
  );
}

export function getDesignSystem(projectId) {
  const row = getDb().prepare(
    'SELECT * FROM design_system WHERE project_id = ?'
  ).get(projectId);
  if (!row) return null;
  return {
    tokens: JSON.parse(row.tokens_json),
    typography: JSON.parse(row.typography_json),
    colors: JSON.parse(row.colors_json),
    updated_at: row.updated_at
  };
}

// --- Voice Anchor Operations ---

export function setVoiceAnchor(projectId, yamlContent) {
  getDb().prepare(`
    INSERT INTO voice_anchor (project_id, yaml_content, updated_at)
    VALUES (?, ?, datetime('now'))
    ON CONFLICT(project_id)
    DO UPDATE SET yaml_content = excluded.yaml_content, updated_at = datetime('now')
  `).run(projectId, yamlContent);
}

export function getVoiceAnchor(projectId) {
  const row = getDb().prepare(
    'SELECT yaml_content FROM voice_anchor WHERE project_id = ?'
  ).get(projectId);
  return row ? row.yaml_content : null;
}

// --- Approval Operations ---

export function addApproval(projectId, stage, node, approvedBy, approved, notes) {
  getDb().prepare(`
    INSERT INTO approvals (project_id, stage, node, approved_by, approved, notes)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(projectId, stage, node, approvedBy, approved ? 1 : 0, notes);
}

export function getApprovals(projectId, stage = null) {
  if (stage !== null) {
    return getDb().prepare(
      'SELECT * FROM approvals WHERE project_id = ? AND stage = ? ORDER BY created_at DESC'
    ).all(projectId, stage);
  }
  return getDb().prepare(
    'SELECT * FROM approvals WHERE project_id = ? ORDER BY created_at DESC'
  ).all(projectId);
}

// --- Vault Asset DB Operations (metadata only, file I/O in vault.js) ---

export function insertVaultAsset(id, projectId, type, stage, filename, filepath, metadata) {
  getDb().prepare(`
    INSERT INTO vault_assets (id, project_id, type, stage, filename, path, metadata_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, projectId, type, stage, filename, filepath, JSON.stringify(metadata));
}

export function getVaultAssets(projectId, type = null) {
  if (type) {
    return getDb().prepare(
      'SELECT * FROM vault_assets WHERE project_id = ? AND type = ? ORDER BY created_at DESC'
    ).all(projectId, type);
  }
  return getDb().prepare(
    'SELECT * FROM vault_assets WHERE project_id = ? ORDER BY created_at DESC'
  ).all(projectId);
}

export function approveVaultAsset(assetId) {
  getDb().prepare(
    'UPDATE vault_assets SET approved = 1 WHERE id = ?'
  ).run(assetId);
}

// --- Content Calendar Operations ---

export function setContentCalendar(projectId, layer, data) {
  getDb().prepare(`
    INSERT INTO content_calendar (project_id, layer, data_json)
    VALUES (?, ?, ?)
  `).run(projectId, layer, JSON.stringify(data));
}

export function getContentCalendar(projectId, layer = null) {
  if (layer) {
    return getDb().prepare(
      'SELECT * FROM content_calendar WHERE project_id = ? AND layer = ? ORDER BY created_at DESC'
    ).all(projectId, layer);
  }
  return getDb().prepare(
    'SELECT * FROM content_calendar WHERE project_id = ? ORDER BY created_at DESC'
  ).all(projectId);
}
