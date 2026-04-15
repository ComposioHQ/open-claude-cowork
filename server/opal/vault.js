import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { insertVaultAsset, getVaultAssets, approveVaultAsset as dbApproveAsset } from './database.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', '..', 'data', 'projects');

/**
 * Asset Vault - manages file storage and metadata for OPAL project assets.
 *
 * Files are stored on disk at: data/projects/{projectId}/vault/{type}/
 * Metadata is stored in SQLite via database.js.
 */

/**
 * Generate a unique asset ID.
 */
function generateAssetId() {
  return 'asset_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

/**
 * Ensure the vault directory structure exists for a project.
 */
function ensureVaultDir(projectId, type) {
  const dir = path.join(DATA_DIR, projectId, 'vault', type);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Ensure a project directory exists.
 */
export function ensureProjectDir(projectId) {
  const dirs = [
    path.join(DATA_DIR, projectId, 'vault', 'logos'),
    path.join(DATA_DIR, projectId, 'vault', 'moodboards'),
    path.join(DATA_DIR, projectId, 'vault', 'design-system'),
    path.join(DATA_DIR, projectId, 'voice'),
    path.join(DATA_DIR, projectId, 'content'),
    path.join(DATA_DIR, projectId, 'exports', 'homepage'),
  ];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Save an asset to the vault.
 *
 * @param {string} projectId - The project ID
 * @param {string} type - Asset type (logo, moodboard, design-token, etc.)
 * @param {number} stage - The pipeline stage that created this asset
 * @param {string} filename - The filename for the asset
 * @param {string|Buffer} content - The file content
 * @param {Object} metadata - Additional metadata
 * @returns {{ id: string, path: string }}
 */
export function saveAsset(projectId, type, stage, filename, content, metadata = {}) {
  const dir = ensureVaultDir(projectId, type === 'logo' ? 'logos' : type + 's');
  const assetId = generateAssetId();
  const filePath = path.join(dir, filename);

  // Write the file
  if (Buffer.isBuffer(content)) {
    fs.writeFileSync(filePath, content);
  } else {
    fs.writeFileSync(filePath, content, 'utf-8');
  }

  // Store metadata in DB
  insertVaultAsset(assetId, projectId, type, stage, filename, filePath, metadata);

  return { id: assetId, path: filePath };
}

/**
 * Read an asset's content from the vault.
 *
 * @param {string} filePath - Full path to the asset file
 * @param {string} encoding - File encoding (default 'utf-8', use null for binary)
 * @returns {string|Buffer}
 */
export function readAsset(filePath, encoding = 'utf-8') {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Asset not found: ${filePath}`);
  }
  return fs.readFileSync(filePath, encoding);
}

/**
 * List all assets for a project, optionally filtered by type.
 */
export function listAssets(projectId, type = null) {
  return getVaultAssets(projectId, type);
}

/**
 * Mark an asset as approved.
 */
export function approveAsset(assetId) {
  dbApproveAsset(assetId);
}

/**
 * Save a voice anchor YAML file to the project directory.
 */
export function saveVoiceFile(projectId, yamlContent) {
  const dir = path.join(DATA_DIR, projectId, 'voice');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, 'voice-anchor.yaml');
  fs.writeFileSync(filePath, yamlContent, 'utf-8');
  return filePath;
}

/**
 * Save design system JSON files to the project directory.
 */
export function saveDesignSystemFiles(projectId, tokens, typography, colors) {
  const dir = path.join(DATA_DIR, projectId, 'vault', 'design-system');
  fs.mkdirSync(dir, { recursive: true });

  fs.writeFileSync(path.join(dir, 'tokens.json'), JSON.stringify(tokens, null, 2), 'utf-8');
  fs.writeFileSync(path.join(dir, 'typography.json'), JSON.stringify(typography, null, 2), 'utf-8');
  fs.writeFileSync(path.join(dir, 'colors.json'), JSON.stringify(colors, null, 2), 'utf-8');

  return dir;
}

/**
 * Save homepage export files to the project directory.
 */
export function saveHomepageExport(projectId, files) {
  const dir = path.join(DATA_DIR, projectId, 'exports', 'homepage');
  fs.mkdirSync(dir, { recursive: true });

  for (const [filename, content] of Object.entries(files)) {
    fs.writeFileSync(path.join(dir, filename), content, 'utf-8');
  }

  return dir;
}

/**
 * Save content calendar JSON to the project directory.
 */
export function saveContentCalendar(projectId, calendarData) {
  const dir = path.join(DATA_DIR, projectId, 'content');
  fs.mkdirSync(dir, { recursive: true });
  const filePath = path.join(dir, 'calendar.json');
  fs.writeFileSync(filePath, JSON.stringify(calendarData, null, 2), 'utf-8');
  return filePath;
}

/**
 * Get the data directory path for a project.
 */
export function getProjectDataDir(projectId) {
  return path.join(DATA_DIR, projectId);
}
